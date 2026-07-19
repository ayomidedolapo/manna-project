import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  mapKwikJobsToMannaStatus,
  type KwikJobStatusSnapshot,
} from "@/lib/kwik/statusMapping";
import { generateVendorSettlementsForOrder } from "@/lib/marketplace/vendorSettlement";

type KwikViewTaskOrder = {
  job_id?: number;
  job_type?: number;
  job_status?: number;
  address?: string;
  unique_order_id?: string;
};

type KwikViewTaskResponse = {
  message?: string;
  status?: number;
  data?: {
    total_amount?: number;
    orders?: KwikViewTaskOrder[];
  };
};

type DeliveryForSync = {
  id: string;
  orderId: string;
  kwikUniqueOrderId: string | null;
  kwikJobStatus: number | null;
};

export type KwikStatusSyncResult = {
  deliveryId: string;
  orderId: string;
  kwikUniqueOrderId: string;
  changed: boolean;
  deliveryStatus: string;
  orderStatus: string;
  processingStatus: string;
  settlementCreatedCount: number;
  settlementSkippedCount: number;
};

function getKwikBaseUrl(): string {
  const baseUrl = process.env.KWIK_BASE_URL;
  if (!baseUrl) {
    throw new Error("KWIK_BASE_URL is not configured.");
  }

  return baseUrl.replace(/\/+$/, "");
}

function getKwikAccessToken(): string {
  const token = process.env.KWIK_ACCESS_TOKEN;
  if (!token) {
    throw new Error("KWIK_ACCESS_TOKEN is not configured.");
  }

  return token;
}

function buildKwikTaskDetailsUrl(uniqueOrderId: string): string {
  const url = new URL(`${getKwikBaseUrl()}/view_task_by_relationship_id`);
  url.searchParams.set("access_token", getKwikAccessToken());
  url.searchParams.set("unique_order_id", uniqueOrderId);
  return url.toString();
}

function normalizeKwikJobs(response: KwikViewTaskResponse): KwikJobStatusSnapshot[] {
  const orders = response.data?.orders ?? [];

  return orders.map((order) => ({
    jobId: order.job_id,
    jobType: order.job_type,
    jobStatus: order.job_status,
    address: order.address,
  }));
}

function latestJobStatus(jobs: KwikJobStatusSnapshot[]): number | null {
  const statuses = jobs
    .map((job) => job.jobStatus)
    .filter((status): status is number => typeof status === "number");

  if (statuses.length === 0) {
    return null;
  }

  if (statuses.includes(2)) {
    return 2;
  }

  return statuses[statuses.length - 1] ?? null;
}

function nextCheckAt(delayMinutes: number | null): Date | null {
  if (delayMinutes === null) {
    return null;
  }

  return new Date(Date.now() + delayMinutes * 60_000);
}

function hashPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function fetchKwikTaskDetails(
  uniqueOrderId: string
): Promise<{ response: KwikViewTaskResponse; jobs: KwikJobStatusSnapshot[] }> {
  const response = await fetch(buildKwikTaskDetailsUrl(uniqueOrderId), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: KwikViewTaskResponse;

  try {
    parsed = JSON.parse(text) as KwikViewTaskResponse;
  } catch {
    throw new Error(`Kwik returned a non-JSON status response: ${text.slice(0, 200)}`);
  }

  if (!response.ok || parsed.status !== 200) {
    throw new Error(parsed.message ?? "Kwik status request failed.");
  }

  return {
    response: parsed,
    jobs: normalizeKwikJobs(parsed),
  };
}

async function getDeliveryForSync(deliveryId: string): Promise<DeliveryForSync> {
  const delivery = (await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      orderId: true,
      kwikUniqueOrderId: true,
      kwikJobStatus: true,
    },
  })) as DeliveryForSync | null;

  if (!delivery) {
    throw new Error("Delivery not found.");
  }

  if (!delivery.kwikUniqueOrderId) {
    throw new Error("Delivery does not have a Kwik unique order ID.");
  }

  return delivery;
}

export async function syncKwikDeliveryStatusByDeliveryId(
  deliveryId: string
): Promise<KwikStatusSyncResult> {
  const delivery = await getDeliveryForSync(deliveryId);
  const { response, jobs } = await fetchKwikTaskDetails(delivery.kwikUniqueOrderId);
  const summary = mapKwikJobsToMannaStatus(jobs);
  const currentKwikJobStatus = latestJobStatus(jobs);
  const statusPayloadHash = hashPayload(response);
  const changed = delivery.kwikJobStatus !== currentKwikJobStatus;

  const updatedDelivery = await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: summary.deliveryStatus,
      processingStatus: summary.processingStatus,
      kwikJobStatus: currentKwikJobStatus,
      lastStatusCheckAt: new Date(),
      statusCheckAttempts: { increment: 1 },
      nextStatusCheckAt: nextCheckAt(summary.nextCheckDelayMinutes),
      lastStatusCheckError: null,
      deliveredAt: summary.deliveryStatus === "DELIVERED" ? new Date() : undefined,
      kwikLastTerminalStatus: summary.isTerminal ? currentKwikJobStatus : undefined,
      kwikRawResponse: response,
    } as never,
    select: {
      id: true,
      orderId: true,
    },
  });

  await prisma.order.update({
    where: { id: updatedDelivery.orderId },
    data: {
      status: summary.orderStatus,
    } as never,
  });

  await prisma.kwikDeliveryTask.updateMany({
    where: {
      OR: [
        { deliveryId: delivery.id },
        { kwikUniqueOrderId: delivery.kwikUniqueOrderId },
      ],
    },
    data: {
      status:
        summary.deliveryStatus === "FAILED"
          ? "FAILED"
          : summary.deliveryStatus === "CANCELLED"
            ? "CANCELLED"
            : "CREATED",
      rawCreateResponse: {
        lastStatusSyncHash: statusPayloadHash,
        lastStatusSyncResponse: response,
      },
    } as never,
  });

  let settlementCreatedCount = 0;
  let settlementSkippedCount = 0;

  if (summary.shouldGenerateSettlement) {
    const settlementResult = await generateVendorSettlementsForOrder(updatedDelivery.orderId);
    settlementCreatedCount = settlementResult.createdCount;
    settlementSkippedCount = settlementResult.skippedCount;
  }

  return {
    deliveryId: delivery.id,
    orderId: updatedDelivery.orderId,
    kwikUniqueOrderId: delivery.kwikUniqueOrderId,
    changed,
    deliveryStatus: summary.deliveryStatus,
    orderStatus: summary.orderStatus,
    processingStatus: summary.processingStatus,
    settlementCreatedCount,
    settlementSkippedCount,
  };
}

export async function syncKwikDeliveryStatusByUniqueOrderId(
  uniqueOrderId: string
): Promise<KwikStatusSyncResult> {
  const delivery = (await prisma.delivery.findFirst({
    where: { kwikUniqueOrderId: uniqueOrderId },
    select: { id: true },
  })) as { id: string } | null;

  if (!delivery) {
    throw new Error("No Manna delivery was found for this Kwik unique order ID.");
  }

  return syncKwikDeliveryStatusByDeliveryId(delivery.id);
}

export async function syncDueKwikDeliveries(limit = 25): Promise<KwikStatusSyncResult[]> {
  const now = new Date();

  const deliveries = (await prisma.delivery.findMany({
    where: {
      partner: "KWIK",
      kwikUniqueOrderId: { not: null },
      status: { notIn: ["DELIVERED", "FAILED", "CANCELLED"] },
      OR: [{ nextStatusCheckAt: null }, { nextStatusCheckAt: { lte: now } }],
    },
    select: { id: true },
    orderBy: [{ nextStatusCheckAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  })) as { id: string }[];

  const results: KwikStatusSyncResult[] = [];

  for (const delivery of deliveries) {
    try {
      results.push(await syncKwikDeliveryStatusByDeliveryId(delivery.id));
    } catch (error) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          lastStatusCheckAt: new Date(),
          statusCheckAttempts: { increment: 1 },
          nextStatusCheckAt: new Date(Date.now() + 10 * 60_000),
          lastStatusCheckError:
            error instanceof Error ? error.message : "Unknown Kwik status sync error.",
        } as never,
      });
    }
  }

  return results;
}

export async function markKwikWebhookReceived(
  payload: unknown,
  uniqueOrderId?: string | null,
  jobId?: string | null,
  jobStatus?: number | null
): Promise<void> {
  const dedupeHash = hashPayload(payload);

  try {
    await prisma.deliveryWebhookEvent.create({
      data: {
        provider: "KWIK",
        dedupeHash,
        uniqueOrderId,
        jobId,
        jobStatus,
        payload,
        processedAt: null,
        status: "RECEIVED",
      } as never,
    });
  } catch {
    // Duplicate webhook retry. Ignore safely.
  }
}
