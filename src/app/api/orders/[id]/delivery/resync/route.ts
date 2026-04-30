import { prisma } from "@/lib/prisma";
import { getKwikJobStatus } from "@/services/kwikWebhook";
import { mapKwikStatusToDeliveryStatus, canMoveForward } from "@/lib/kwik-status";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

type Ctx = { params: Promise<{ id: string }> } | { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const params = await Promise.resolve((ctx as any).params);
    const orderId = params?.id;

    if (!orderId) return bad("Missing order id");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) return bad("Order not found", 404);
    if (!order.delivery) return bad("Order has no delivery", 400);

    const d = order.delivery;
    if (!d.kwikTaskId) return bad("Delivery missing kwikTaskId (job id)", 400);

    const kwik = await getKwikJobStatus(d.kwikTaskId);
    const jobStatus = kwik.job_status;

    const mapped = mapKwikStatusToDeliveryStatus(jobStatus);

    const deliveryData: any = {
      kwikJobStatus: jobStatus,
      lastStatusCheckAt: new Date(),
      lastStatusCheckError: null,
      statusCheckAttempts: 0,
      nextStatusCheckAt: null,
      kwikRawResponse: kwik.raw,
    };

    if (kwik.unique_order_id && !d.kwikUniqueOrderId) {
      deliveryData.kwikUniqueOrderId = kwik.unique_order_id;
    }
    if (kwik.tracking_url && !d.kwikTrackingUrl) {
      deliveryData.kwikTrackingUrl = kwik.tracking_url;
    }

    const shouldUpdate =
      d.status !== mapped && canMoveForward(d.status as any, mapped as any);

    if (shouldUpdate) deliveryData.status = mapped;

    if (mapped === "DELIVERED") {
      deliveryData.deliveredAt = d.deliveredAt ?? new Date();
      deliveryData.kwikLastTerminalStatus = jobStatus;
    }

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: d.id }, data: deliveryData });

      if (mapped === "DELIVERED") {
        await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
      } else if (mapped === "FAILED" || mapped === "CANCELLED") {
        if (order.status !== "DELIVERED") {
          await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
        }
      } else if (mapped === "ASSIGNED" || mapped === "IN_TRANSIT") {
        if (order.status !== "DELIVERED") {
          await tx.order.update({ where: { id: orderId }, data: { status: "OUT_FOR_DELIVERY" } });
        }
      }
    });

    return Response.json({
      ok: true,
      orderId,
      deliveryId: d.id,
      jobId: d.kwikTaskId,
      jobStatus,
      mappedStatus: mapped,
      updated: shouldUpdate,
      usedEndpoint: kwik.usedEndpoint,
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message ?? "resync_error" }, { status: 500 });
  }
}
