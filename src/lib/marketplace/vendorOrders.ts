import { prisma } from "@/lib/prisma";
import { createKwikMarketplaceTaskFromStoredQuote } from "@/lib/kwik/quoteService";

type JsonRecord = Record<string, unknown>;

export const VENDOR_ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  AWAITING_VENDOR: "AWAITING_VENDOR",
  PACKING: "PACKING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  PICKED_UP: "PICKED_UP",
  CANCELLED: "CANCELLED",
  REJECTED: "REJECTED",
} as const;

export const MARKETPLACE_FULFILLMENT_STATUS = {
  NOT_MARKETPLACE: "NOT_MARKETPLACE",
  WAITING_PAYMENT: "WAITING_PAYMENT",
  WAITING_FOR_VENDORS: "WAITING_FOR_VENDORS",
  READY_FOR_KWIK: "READY_FOR_KWIK",
  KWIK_TASK_CREATED: "KWIK_TASK_CREATED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type VendorReadinessResult = {
  vendorOrderId: string;
  orderId: string;
  status: string;
  totalVendorOrders: number;
  readyVendorOrders: number;
  allReady: boolean;
  dispatch: KwikReadyDispatchResult;
};

export type KwikReadyDispatchResult = {
  attempted: boolean;
  created: boolean;
  skippedReason?: string;
  task?: {
    id: string;
    status: string;
    kwikUniqueOrderId: string | null;
    kwikTrackingLinks: unknown;
  };
};

type VendorPickupLocationSnapshot = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  contactName: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type OrderItemForVendorOrder = {
  id: string;
  productId: string;
  productVariantId: string | null;
  quantity: number;
  unitPriceNgn: number;
  subtotalNgn: number;
  product: {
    id: string;
    name: string;
    vendorId: string | null;
    marketClusterId: string | null;
    vendor: {
      id: string;
      displayName: string;
      marketClusterId: string;
      pickupLocations: VendorPickupLocationSnapshot[];
    } | null;
  };
};

type OrderForVendorOrderBuild = {
  id: string;
  paymentStatus: string;
  status: string;
  deliveryQuoteId: string | null;
  marketClusterId: string | null;
  items: OrderItemForVendorOrder[];
};

type VendorOrderForAccess = {
  id: string;
  orderId: string;
  vendorId: string;
  marketClusterId: string;
  status: string;
};

type VendorOrderCount = {
  id: string;
  status: string;
};

type DeliveryQuoteForDispatch = {
  id: string;
  orderId: string | null;
  marketClusterId: string;
  status: string;
  rawQuoteRequest: JsonRecord;
  rawQuoteResponse: JsonRecord | null;
  rawBillResponse: JsonRecord | null;
};

type OrderForDispatch = {
  id: string;
  paymentStatus: string;
  status: string;
  marketClusterId: string | null;
  deliveryQuoteId: string | null;
  delivery: { id: string } | null;
};

function pickDefaultPickupLocation(
  vendorName: string,
  locations: VendorPickupLocationSnapshot[]
): VendorPickupLocationSnapshot {
  const activeLocations = locations.filter((location) => location.isActive);
  const selected =
    activeLocations.find((location) => location.isDefault) ?? activeLocations[0] ?? null;

  if (!selected) {
    throw new Error(`${vendorName} does not have an active pickup location`);
  }

  return selected;
}

function groupOrderItemsByVendor(items: OrderItemForVendorOrder[]) {
  const grouped = new Map<string, OrderItemForVendorOrder[]>();

  for (const item of items) {
    const vendorId = item.product.vendorId;

    if (!vendorId || !item.product.vendor) {
      throw new Error(`${item.product.name} is not attached to an approved vendor`);
    }

    const existing = grouped.get(vendorId) ?? [];
    existing.push(item);
    grouped.set(vendorId, existing);
  }

  return grouped;
}

function isReadyStatus(status: string): boolean {
  return status === VENDOR_ORDER_STATUS.READY_FOR_PICKUP || status === VENDOR_ORDER_STATUS.PICKED_UP;
}

function asJsonRecord(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

async function updateOrderReadinessCounters(orderId: string) {
  const vendorOrders = (await prisma.vendorOrder.findMany({
    where: { orderId },
    select: { id: true, status: true },
  })) as VendorOrderCount[];

  const totalVendorOrders = vendorOrders.length;
  const readyVendorOrders = vendorOrders.filter((vendorOrder) => isReadyStatus(vendorOrder.status)).length;
  const allReady = totalVendorOrders > 0 && totalVendorOrders === readyVendorOrders;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      vendorOrderCount: totalVendorOrders,
      vendorReadyCount: readyVendorOrders,
      marketplaceFulfillmentStatus: allReady
        ? MARKETPLACE_FULFILLMENT_STATUS.READY_FOR_KWIK
        : MARKETPLACE_FULFILLMENT_STATUS.WAITING_FOR_VENDORS,
      readyForKwikAt: allReady ? new Date() : null,
    } as never,
  });

  return { totalVendorOrders, readyVendorOrders, allReady };
}

export async function createVendorOrdersForPaidMarketplaceOrder(orderId: string) {
  const order = (await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentStatus: true,
      status: true,
      deliveryQuoteId: true,
      marketClusterId: true,
      items: {
        select: {
          id: true,
          productId: true,
          productVariantId: true,
          quantity: true,
          unitPriceNgn: true,
          subtotalNgn: true,
          product: {
            select: {
              id: true,
              name: true,
              vendorId: true,
              marketClusterId: true,
              vendor: {
                select: {
                  id: true,
                  displayName: true,
                  marketClusterId: true,
                  pickupLocations: {
                    select: {
                      id: true,
                      label: true,
                      address: true,
                      latitude: true,
                      longitude: true,
                      contactName: true,
                      phone: true,
                      isDefault: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })) as OrderForVendorOrderBuild | null;

  if (!order) throw new Error("Order not found");

  if (!order.deliveryQuoteId || !order.marketClusterId) {
    return { created: 0, existing: 0, marketplace: false };
  }

  if (order.paymentStatus !== "PAID") {
    throw new Error("Vendor orders can only be created after payment is confirmed");
  }

  const grouped = groupOrderItemsByVendor(order.items);

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let existing = 0;

    for (const [vendorId, items] of grouped.entries()) {
      const firstItem = items[0];
      const vendor = firstItem.product.vendor;

      if (!vendor) throw new Error("Vendor not found for order item");

      if (vendor.marketClusterId !== order.marketClusterId) {
        throw new Error(`${vendor.displayName} is outside this order market cluster`);
      }

      const pickupLocation = pickDefaultPickupLocation(vendor.displayName, vendor.pickupLocations);

      const existingVendorOrder = await tx.vendorOrder.findUnique({
        where: { orderId_vendorId: { orderId: order.id, vendorId } },
        select: { id: true },
      });

      if (existingVendorOrder) {
        existing += 1;
        continue;
      }

      await tx.vendorOrder.create({
        data: {
          orderId: order.id,
          vendorId,
          marketClusterId: order.marketClusterId,
          status: VENDOR_ORDER_STATUS.AWAITING_VENDOR,
          pickupLocationId: pickupLocation.id,
          pickupAddress: pickupLocation.address,
          pickupLat: pickupLocation.latitude,
          pickupLng: pickupLocation.longitude,
          pickupContactName: pickupLocation.contactName,
          pickupPhone: pickupLocation.phone,
          items: {
            create: items.map((item) => ({
              orderItemId: item.id,
              productId: item.productId,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPriceNgn: item.unitPriceNgn,
              subtotalNgn: item.subtotalNgn,
            })),
          },
          readinessEvents: {
            create: {
              orderId: order.id,
              vendorId,
              type: "CREATED_AFTER_PAYMENT",
              note: "Vendor order created after successful customer payment.",
            },
          },
        } as never,
      });

      created += 1;
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        marketplaceFulfillmentStatus: MARKETPLACE_FULFILLMENT_STATUS.WAITING_FOR_VENDORS,
        vendorOrderCount: grouped.size,
        vendorReadyCount: 0,
      } as never,
    });

    await tx.delivery.upsert({
      where: { orderId: order.id },
      update: {
        processingStatus: "QUEUED",
        requiresManualDispatch: false,
        scheduledDispatchAt: null,
        dispatchDeferredReason: "WAITING_FOR_VENDOR_READY",
      } as never,
      create: {
        orderId: order.id,
        partner: "KWIK",
        status: "CREATED",
        processingStatus: "QUEUED",
        requiresManualDispatch: false,
        dispatchDeferredReason: "WAITING_FOR_VENDOR_READY",
      } as never,
    });

    return { created, existing, marketplace: true };
  });

  return result;
}

export async function assertUserCanAccessVendorOrder(userId: string, vendorOrderId: string) {
  const vendorOrder = (await prisma.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      marketClusterId: true,
      status: true,
    },
  })) as VendorOrderForAccess | null;

  if (!vendorOrder) throw new Error("Vendor order not found");

  const membership = await prisma.vendorUser.findFirst({
    where: {
      userId,
      vendorId: vendorOrder.vendorId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!membership) throw new Error("You do not have access to this vendor order");

  return vendorOrder;
}

export async function markVendorOrderReady(args: {
  vendorOrderId: string;
  actorUserId?: string;
  note?: string;
}) : Promise<VendorReadinessResult> {
  const vendorOrder = (await prisma.vendorOrder.findUnique({
    where: { id: args.vendorOrderId },
    select: {
      id: true,
      orderId: true,
      vendorId: true,
      marketClusterId: true,
      status: true,
    },
  })) as VendorOrderForAccess | null;

  if (!vendorOrder) throw new Error("Vendor order not found");

  if (vendorOrder.status === VENDOR_ORDER_STATUS.CANCELLED || vendorOrder.status === VENDOR_ORDER_STATUS.REJECTED) {
    throw new Error("Cancelled or rejected vendor orders cannot be marked ready");
  }

  if (!isReadyStatus(vendorOrder.status)) {
    await prisma.$transaction(async (tx) => {
      await tx.vendorOrder.update({
        where: { id: vendorOrder.id },
        data: {
          status: VENDOR_ORDER_STATUS.READY_FOR_PICKUP,
          readyForPickupAt: new Date(),
          readinessNote: args.note ?? null,
        } as never,
      });

      await tx.vendorOrderReadinessEvent.create({
        data: {
          vendorOrderId: vendorOrder.id,
          orderId: vendorOrder.orderId,
          vendorId: vendorOrder.vendorId,
          actorUserId: args.actorUserId ?? null,
          type: "READY_FOR_PICKUP",
          note: args.note ?? null,
        } as never,
      });
    });
  }

  const counts = await updateOrderReadinessCounters(vendorOrder.orderId);
  const dispatch = counts.allReady
    ? await attemptCreateKwikTaskForReadyOrder(vendorOrder.orderId)
    : { attempted: false, created: false, skippedReason: "WAITING_FOR_OTHER_VENDORS" };

  return {
    vendorOrderId: vendorOrder.id,
    orderId: vendorOrder.orderId,
    status: VENDOR_ORDER_STATUS.READY_FOR_PICKUP,
    totalVendorOrders: counts.totalVendorOrders,
    readyVendorOrders: counts.readyVendorOrders,
    allReady: counts.allReady,
    dispatch,
  };
}

export async function attemptCreateKwikTaskForReadyOrder(orderId: string): Promise<KwikReadyDispatchResult> {
  const order = (await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentStatus: true,
      status: true,
      marketClusterId: true,
      deliveryQuoteId: true,
      delivery: { select: { id: true } },
    },
  })) as OrderForDispatch | null;

  if (!order) throw new Error("Order not found");

  if (order.paymentStatus !== "PAID") {
    return { attempted: false, created: false, skippedReason: "ORDER_NOT_PAID" };
  }

  if (!order.deliveryQuoteId || !order.marketClusterId) {
    return { attempted: false, created: false, skippedReason: "ORDER_HAS_NO_LOCKED_MARKETPLACE_QUOTE" };
  }

  const vendorOrders = (await prisma.vendorOrder.findMany({
    where: { orderId },
    select: { id: true, status: true },
  })) as VendorOrderCount[];

  if (vendorOrders.length === 0) {
    return { attempted: false, created: false, skippedReason: "NO_VENDOR_ORDERS" };
  }

  const notReady = vendorOrders.find((vendorOrder) => !isReadyStatus(vendorOrder.status));
  if (notReady) {
    return { attempted: false, created: false, skippedReason: "WAITING_FOR_VENDOR_READY" };
  }

  const existingTask = await prisma.kwikDeliveryTask.findFirst({
    where: { orderId },
    select: {
      id: true,
      status: true,
      kwikUniqueOrderId: true,
      kwikTrackingLinks: true,
    },
  });

  if (existingTask?.status === "CREATED") {
    return { attempted: false, created: false, skippedReason: "KWIK_TASK_ALREADY_CREATED", task: existingTask };
  }

  if (existingTask?.status === "PENDING") {
    return { attempted: false, created: false, skippedReason: "KWIK_TASK_CREATION_IN_PROGRESS", task: existingTask };
  }

  const quote = (await prisma.deliveryQuote.findUnique({
    where: { id: order.deliveryQuoteId },
    select: {
      id: true,
      orderId: true,
      marketClusterId: true,
      status: true,
      rawQuoteRequest: true,
      rawQuoteResponse: true,
      rawBillResponse: true,
    },
  })) as DeliveryQuoteForDispatch | null;

  if (!quote) throw new Error("Delivery quote not found");

  if (quote.orderId !== order.id) {
    throw new Error("Delivery quote is not locked to this order");
  }

  if (quote.status !== "USED") {
    throw new Error("Delivery quote must be locked by checkout before Kwik task creation");
  }

  if (quote.marketClusterId !== order.marketClusterId) {
    throw new Error("Delivery quote market cluster does not match order market cluster");
  }

  if (!quote.rawQuoteResponse || !quote.rawBillResponse) {
    throw new Error("Delivery quote does not contain complete Kwik quote data");
  }

  const pendingPayload = {
    pending: true,
    reason: "VENDORS_READY_FOR_PICKUP",
    deliveryQuoteId: quote.id,
    createdAt: new Date().toISOString(),
  };

  const pendingTask = existingTask
    ? await prisma.kwikDeliveryTask.update({
        where: { id: existingTask.id },
        data: {
          status: "PENDING",
          error: null,
          rawCreateRequest: pendingPayload,
        } as never,
        select: { id: true },
      })
    : await prisma.kwikDeliveryTask.create({
        data: {
          orderId: order.id,
          deliveryId: order.delivery?.id ?? null,
          deliveryQuoteId: quote.id,
          marketClusterId: quote.marketClusterId,
          status: "PENDING",
          pickupCount: vendorOrders.length,
          deliveryCount: 1,
          rawCreateRequest: pendingPayload,
        } as never,
        select: { id: true },
      });

  try {
    const result = await createKwikMarketplaceTaskFromStoredQuote({
      quotePayload: asJsonRecord(quote.rawQuoteRequest),
      quoteResponse: asJsonRecord(quote.rawQuoteResponse),
      billResponse: asJsonRecord(quote.rawBillResponse),
    });

    const task = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.kwikDeliveryTask.update({
        where: { id: pendingTask.id },
        data: {
          status: "CREATED",
          pickupCount: result.kwikPickupJobIds.length || vendorOrders.length,
          deliveryCount: result.kwikDeliveryJobIds.length || 1,
          kwikUniqueOrderId: result.kwikUniqueOrderId,
          kwikPickupJobIds: result.kwikPickupJobIds,
          kwikDeliveryJobIds: result.kwikDeliveryJobIds,
          kwikJobToken: result.kwikJobToken,
          kwikStatusCheckUrl: result.kwikStatusCheckUrl,
          kwikTrackingLinks: result.kwikTrackingLinks,
          rawCreateRequest: result.createPayload,
          rawCreateResponse: result.createResponse,
          error: null,
        } as never,
        select: {
          id: true,
          status: true,
          kwikUniqueOrderId: true,
          kwikTrackingLinks: true,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          marketplaceFulfillmentStatus: MARKETPLACE_FULFILLMENT_STATUS.KWIK_TASK_CREATED,
          kwikTaskCreatedAt: new Date(),
        } as never,
      });

      if (order.delivery?.id) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: "CREATED",
            processingStatus: "DISPATCHED",
            requiresManualDispatch: false,
            dispatchDeferredReason: null,
            kwikUniqueOrderId: result.kwikUniqueOrderId,
            kwikStatusCheckUrl: result.kwikStatusCheckUrl,
            kwikTrackingUrl: result.kwikTrackingLinks[0] ?? null,
            kwikRawResponse: result.createResponse,
          } as never,
        });
      }

      return updatedTask;
    });

    return { attempted: true, created: true, task };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Kwik task creation failed";

    await prisma.kwikDeliveryTask.update({
      where: { id: pendingTask.id },
      data: {
        status: "FAILED",
        error: message,
      } as never,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        marketplaceFulfillmentStatus: MARKETPLACE_FULFILLMENT_STATUS.FAILED,
      } as never,
    });

    throw error;
  }
}
