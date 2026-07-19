import { prisma } from "@/lib/prisma";
import { createNotification } from "./notificationService";

type AdminRecipient = {
  recipientRole: "ADMIN";
  recipientUserId: string;
};

async function getAdminRecipients(): Promise<AdminRecipient[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  return admins.map((admin) => ({ recipientRole: "ADMIN", recipientUserId: admin.id }));
}

export async function notifyAdminVendorRegistered(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, displayName: true, marketClusterId: true },
  });

  if (!vendor) return null;

  return createNotification({
    eventType: "VENDOR_REGISTERED",
    category: "VENDOR",
    priority: "HIGH",
    title: "New vendor registration",
    body: `${vendor.displayName} submitted a vendor registration for review.`,
    actionUrl: `/admin/vendors/${vendor.id}`,
    actionLabel: "Review vendor",
    vendorId: vendor.id,
    marketClusterId: vendor.marketClusterId,
    recipients: await getAdminRecipients(),
  });
}

export async function notifyVendorApproved(vendorId: string) {
  const vendorUsers = await prisma.vendorUser.findMany({
    where: { vendorId, isActive: true },
    select: { userId: true, vendor: { select: { displayName: true } } },
  });

  if (vendorUsers.length === 0) return null;

  return createNotification({
    eventType: "VENDOR_APPROVED",
    category: "VENDOR",
    priority: "HIGH",
    title: "Your store is approved",
    body: `${vendorUsers[0].vendor.displayName} can now sell on Manna.`,
    actionUrl: "/vendor/dashboard",
    actionLabel: "Open dashboard",
    vendorId,
    recipients: vendorUsers.map((item) => ({
      recipientRole: "VENDOR",
      recipientUserId: item.userId,
      vendorId,
    })),
  });
}

export async function notifyVendorNewOrder(vendorOrderId: string) {
  const vendorOrder = await prisma.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      marketClusterId: true,
      grossAmountNgn: true,
    },
  });

  if (!vendorOrder) return null;

  const vendorUsers = await prisma.vendorUser.findMany({
    where: { vendorId: vendorOrder.vendorId, isActive: true },
    select: { userId: true },
  });

  return createNotification({
    eventType: "VENDOR_NEW_ORDER",
    category: "ORDER",
    priority: "URGENT",
    title: "New order received",
    body: `Prepare the items for this order. Total: ₦${vendorOrder.grossAmountNgn.toLocaleString("en-NG")}.`,
    actionUrl: `/vendor/orders/${vendorOrder.id}`,
    actionLabel: "View order",
    orderId: vendorOrder.orderId,
    vendorId: vendorOrder.vendorId,
    vendorOrderId: vendorOrder.id,
    marketClusterId: vendorOrder.marketClusterId,
    recipients: vendorUsers.map((user) => ({
      recipientRole: "VENDOR",
      recipientUserId: user.userId,
      vendorId: vendorOrder.vendorId,
    })),
  });
}

export async function notifyCustomerOrderPaid(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, orderNumber: true },
  });

  if (!order?.userId) return null;

  return createNotification({
    eventType: "CUSTOMER_ORDER_PAID",
    category: "PAYMENT",
    priority: "HIGH",
    title: "Payment received",
    body: `Your Manna order ${order.orderNumber} has been received. Vendors are preparing your items.`,
    actionUrl: `/orders/${order.id}`,
    actionLabel: "Track order",
    orderId: order.id,
    recipients: [{ recipientRole: "CUSTOMER", recipientUserId: order.userId }],
  });
}

export async function notifyCustomerDeliveryStarted(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, orderNumber: true, delivery: { select: { id: true } } },
  });

  if (!order?.userId) return null;

  return createNotification({
    eventType: "CUSTOMER_DELIVERY_STARTED",
    category: "DELIVERY",
    priority: "HIGH",
    title: "Your order is on the way",
    body: `Your Manna order ${order.orderNumber} has been picked up and is on the way.`,
    actionUrl: `/orders/${order.id}/tracking`,
    actionLabel: "Track delivery",
    orderId: order.id,
    deliveryId: order.delivery?.id ?? null,
    recipients: [{ recipientRole: "CUSTOMER", recipientUserId: order.userId }],
  });
}

export async function notifyCustomerOrderDeliveredFeedback(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, orderNumber: true, delivery: { select: { id: true } } },
  });

  if (!order?.userId) return null;

  return createNotification({
    eventType: "CUSTOMER_ORDER_DELIVERED_FEEDBACK",
    category: "FEEDBACK",
    priority: "HIGH",
    title: "Order delivered",
    body: `Your Manna order ${order.orderNumber} has been delivered. Please tell us how it went.`,
    actionUrl: `/orders/${order.id}/feedback`,
    actionLabel: "Give feedback",
    orderId: order.id,
    deliveryId: order.delivery?.id ?? null,
    recipients: [{ recipientRole: "CUSTOMER", recipientUserId: order.userId }],
  });
}

export async function notifyAdminDeliveryFailed(orderId: string, reason?: string | null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, delivery: { select: { id: true } } },
  });

  if (!order) return null;

  return createNotification({
    eventType: "ADMIN_DELIVERY_FAILED",
    category: "DELIVERY",
    priority: "URGENT",
    title: "Delivery issue needs attention",
    body: `Order ${order.orderNumber} has a delivery problem${reason ? `: ${reason}` : "."}`,
    actionUrl: `/admin/orders/${order.id}`,
    actionLabel: "Review order",
    orderId: order.id,
    deliveryId: order.delivery?.id ?? null,
    recipients: await getAdminRecipients(),
  });
}

export async function notifyVendorSettlementGenerated(vendorId: string, settlementId: string) {
  const settlement = await prisma.vendorSettlement.findUnique({
    where: { id: settlementId },
    select: { id: true, payableAmountNgn: true, orderId: true },
  });

  if (!settlement) return null;

  const vendorUsers = await prisma.vendorUser.findMany({
    where: { vendorId, isActive: true },
    select: { userId: true },
  });

  return createNotification({
    eventType: "VENDOR_SETTLEMENT_GENERATED",
    category: "SETTLEMENT",
    priority: "NORMAL",
    title: "Settlement created",
    body: `₦${settlement.payableAmountNgn.toLocaleString("en-NG")} is pending payout for a delivered order.`,
    actionUrl: `/vendor/settlements/${settlement.id}`,
    actionLabel: "View settlement",
    orderId: settlement.orderId,
    vendorId,
    recipients: vendorUsers.map((user) => ({
      recipientRole: "VENDOR",
      recipientUserId: user.userId,
      vendorId,
    })),
  });
}
