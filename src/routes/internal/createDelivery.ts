import { prisma } from "@/lib/prisma"
import { createKwikDelivery } from "@/services/kwikWebhook"

export async function createDelivery(orderId: string, deliveryLat: number, deliveryLng: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  })

  if (!order) throw new Error("Order not found")
  if (order.paymentStatus !== "PAID") throw new Error("Order not paid")

  const existing = await prisma.delivery.findUnique({ where: { orderId } })
  if (existing) return existing

  if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
    throw new Error("deliveryLat and deliveryLng are required")
  }

  const kwik = await createKwikDelivery({
    orderId: order.id,
    customerName: order.user?.name ?? "Customer",
    customerPhone: order.user?.phone ?? "N/A",
    address: order.deliveryAddress1,
    city: order.city,
    state: order.state,
    deliveryLat,
    deliveryLng,
    amountNgn: order.deliveryFeeNgn, // optional for kwik (pricing returns per_task_cost anyway)
  })

  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id,
      kwikTaskId: kwik.taskId,
      kwikTrackingUrl: kwik.trackingUrl,
      kwikRawResponse: kwik.raw,
      status: "CREATED",
      partner: "KWIK",
    },
  })

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "OUT_FOR_DELIVERY" },
  })

  return delivery
}
