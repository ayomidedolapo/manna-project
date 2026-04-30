import { prisma } from "@/lib/prisma";
import { createKwikDelivery } from "@/services/kwikWebhook";
import { pickKwikVehicle } from "@/lib/delivery/vehiclePicker";

export async function createDeliveryFromOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      user: true,
      items: { include: { productVariant: true, product: true } },
    },
  });

  if (!order) throw new Error("Order not found");
  if (order.delivery) return order.delivery;

  if (!Number.isFinite(order.deliveryLat ?? NaN) || !Number.isFinite(order.deliveryLng ?? NaN)) {
    throw new Error("Order is missing deliveryLat/deliveryLng (required for KWIK)");
  }

  // ✅ Compute totalKg from variants
  let totalKg = 0;

  for (const it of order.items) {
    const kg = it.productVariant?.unitWeightKg;
    if (!Number.isFinite(kg ?? NaN)) {
      // choose one policy:
      // 1) fail hard so admin fixes weight
      throw new Error(`Missing unitWeightKg for variant in order (product: ${it.product?.name ?? "Unknown"})`);
      // 2) OR default to 0, but that can choose wrong vehicle:
      // continue;
    }
    totalKg += Number(kg) * it.quantity;
  }

  const { label, vehicleId } = pickKwikVehicle(totalKg);

  // ✅ Call KWIK
  const kwik = await createKwikDelivery({
    orderId: order.id,
    customerName: order.user?.name ?? "Customer",
    customerPhone: order.user?.phone ?? "",
    address: order.deliveryAddress1,
    city: order.city,
    state: order.state,
    deliveryLat: order.deliveryLat!,
    deliveryLng: order.deliveryLng!,
    amountNgn: order.deliveryFeeNgn,
    vehicleId, // ✅ key change
  });

  // ✅ Save delivery + snapshots
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id,
      partner: "KWIK",
      status: "CREATED",
      kwikTaskId: String(kwik.taskId),
      kwikTrackingUrl: kwik.trackingUrl,
      kwikRawResponse: kwik.raw,
      kwikUniqueOrderId: kwik.uniqueOrderId,
      kwikJobStatus: 1,
      kwikStatusCheckUrl: kwik.statusCheckUrl,

      // NEW snapshots
      kwikVehicleId: vehicleId,
      kwikVehicleLabel: label,
      totalWeightKg: totalKg,
    },
  });

  // also store on Order (optional but useful)
  await prisma.order.update({
    where: { id: order.id },
    data: { totalWeightKg: totalKg, status: "OUT_FOR_DELIVERY" },
  });

  return delivery;
}
