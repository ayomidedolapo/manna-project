// app/api/cron/kwik-sync/route.ts
import { prisma } from "@/lib/prisma";
import { getKwikJobStatus } from "@/services/kwikWebhook";
import {
  canMoveForward,
  computeNextCheck,
  mapKwikStatusToDeliveryStatus,
} from "@/lib/kwik-status";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");

    const expected = process.env.CRON_SECRET;
    if (!expected) return bad("Server misconfig: missing CRON_SECRET", 500);
    if (secret !== expected) return bad("Unauthorized", 401);

    const now = new Date();

    const deliveries = await prisma.delivery.findMany({
      where: {
        partner: "KWIK",
        status: { in: ["CREATED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"] },
        kwikTaskId: { not: null },
        OR: [{ nextStatusCheckAt: null }, { nextStatusCheckAt: { lte: now } }],
      },
      include: { order: true },
      take: 25,
      orderBy: { updatedAt: "asc" },
    });

    const results: any[] = [];

    for (const d of deliveries) {
      const attempt = d.statusCheckAttempts ?? 0;

      try {
        const jobId = d.kwikTaskId!;

        const kwik = await getKwikJobStatus({
          jobId,
          statusCheckUrl: d.kwikStatusCheckUrl ?? null,
        });

        const newDeliveryStatus = mapKwikStatusToDeliveryStatus(kwik.job_status);

        const shouldUpdateStatus =
          d.status !== newDeliveryStatus &&
          canMoveForward(d.status as any, newDeliveryStatus as any);

        const deliveryData: any = {
          kwikJobStatus: kwik.job_status,
          lastStatusCheckAt: new Date(),
          lastStatusCheckError: null,
          statusCheckAttempts: 0,
          nextStatusCheckAt: null,
        };

        if (kwik.unique_order_id && !d.kwikUniqueOrderId) {
          deliveryData.kwikUniqueOrderId = String(kwik.unique_order_id);
        }

        if (kwik.tracking_url && !d.kwikTrackingUrl) {
          deliveryData.kwikTrackingUrl = String(kwik.tracking_url);
        }

        if (kwik.raw) {
          deliveryData.kwikRawResponse = kwik.raw;
        }

        if (shouldUpdateStatus) {
          deliveryData.status = newDeliveryStatus;
        }

        if (newDeliveryStatus === "DELIVERED") {
          deliveryData.deliveredAt = d.deliveredAt ?? new Date();
          deliveryData.kwikLastTerminalStatus = kwik.job_status;
        }

        await prisma.$transaction(async (tx) => {
          await tx.delivery.update({
            where: { id: d.id },
            data: deliveryData,
          });

          if (newDeliveryStatus === "DELIVERED") {
            await tx.order.update({
              where: { id: d.orderId },
              data: { status: "DELIVERED" },
            });
          } else if (newDeliveryStatus === "FAILED" || newDeliveryStatus === "CANCELLED") {
            if (d.order.status !== "DELIVERED") {
              await tx.order.update({
                where: { id: d.orderId },
                data: { status: "CANCELLED" },
              });
            }
          } else if (newDeliveryStatus === "ASSIGNED" || newDeliveryStatus === "IN_TRANSIT") {
            if (d.order.status !== "DELIVERED") {
              await tx.order.update({
                where: { id: d.orderId },
                data: { status: "OUT_FOR_DELIVERY" },
              });
            }
          }
        });

        results.push({
          deliveryId: d.id,
          ok: true,
          jobId,
          jobStatus: kwik.job_status,
          mappedStatus: shouldUpdateStatus ? newDeliveryStatus : d.status,
          note: shouldUpdateStatus
            ? undefined
            : "ignored_backward_or_terminal_transition",
          usedEndpoint: kwik.usedEndpoint,
        });
      } catch (err: any) {
        // ✅ staging-safe fallback
        await prisma.delivery.update({
          where: { id: d.id },
          data: {
            lastStatusCheckAt: new Date(),
            statusCheckAttempts: 999,
            nextStatusCheckAt: null,
            lastStatusCheckError: "KWIK polling disabled (staging)",
          },
        });

        results.push({
          deliveryId: d.id,
          ok: false,
          error: "KWIK polling disabled on staging",
        });
      }
    }

    return Response.json({ ok: true, count: deliveries.length, results });
  } catch (err: any) {
    console.error("KWIK_SYNC_ERROR:", err);
    return Response.json(
      { ok: false, error: err?.message ?? "sync_error" },
      { status: 500 }
    );
  }
}
