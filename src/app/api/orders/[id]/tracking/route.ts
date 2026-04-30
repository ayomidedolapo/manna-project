import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

type Ctx =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> }
  | { params?: any };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const url = new URL(req.url);

    // ✅ Next.js may provide params as a Promise in some runtimes/dev setups
    const params = ctx?.params ? await Promise.resolve(ctx.params) : null;

    // Because your folder is [id], the param name is "id"
    const paramId = params?.id;

    // Optional fallback (helps testing)
    const queryId = url.searchParams.get("orderId") || url.searchParams.get("id");

    const orderId = String(paramId || queryId || "").trim();

    if (!orderId) {
      return bad(
        "Missing id param. Your route is /api/orders/[id]/tracking so call /api/orders/<id>/tracking",
        400
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) {
      return bad("Order not found", 404);
    }

    const delivery = order.delivery;

    const orFilters = [
      delivery?.kwikTaskId ? { jobId: delivery.kwikTaskId } : null,
      delivery?.kwikUniqueOrderId ? { uniqueOrderId: delivery.kwikUniqueOrderId } : null,
    ].filter(Boolean) as any[];

    const events = delivery
      ? await prisma.deliveryWebhookEvent.findMany({
          where: orFilters.length ? { OR: orFilters } : undefined,
          orderBy: { receivedAt: "asc" },
          take: 50,
        })
      : [];

    return Response.json({
      ok: true,
      debug: { paramId: paramId ?? null, queryId: queryId ?? null },
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryPartner: order.deliveryPartner,
        createdAt: order.createdAt,
      },
      delivery: delivery
        ? {
            id: delivery.id,
            status: delivery.status,
            partner: delivery.partner,
            kwikTaskId: delivery.kwikTaskId,
            kwikUniqueOrderId: delivery.kwikUniqueOrderId,
            kwikJobStatus: delivery.kwikJobStatus,
            kwikTrackingUrl: delivery.kwikTrackingUrl,
            lastWebhookAt: delivery.lastWebhookAt,
            lastStatusCheckAt: delivery.lastStatusCheckAt,
            statusCheckAttempts: delivery.statusCheckAttempts,
            nextStatusCheckAt: delivery.nextStatusCheckAt,
            lastStatusCheckError: delivery.lastStatusCheckError,
            updatedAt: delivery.updatedAt,
          }
        : null,
      timeline: events.map((e) => ({
        id: e.id,
        jobId: e.jobId,
        uniqueOrderId: e.uniqueOrderId,
        jobStatus: e.jobStatus,
        receivedAt: e.receivedAt,
        processedAt: e.processedAt,
        status: e.status,
        error: e.error,
      })),
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "tracking_error" },
      { status: 500 }
    );
  }
}
