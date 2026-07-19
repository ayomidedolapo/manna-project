import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDeliveryFromOrder } from "@/lib/delivery/createDeliveryFromOrder";
import {
  isWithinDeliveryWindow,
  getNextDeliveryWindowStart,
} from "@/lib/delivery/deliveryWindow";
import { createVendorOrdersForPaidMarketplaceOrder } from "@/lib/marketplace/vendorOrders";

export const runtime = "nodejs";

type ProductVariantForPayment = {
  id: string;
  name: string;
  stockQty: number | null;
};

type OrderItemForPayment = {
  quantity: number;
  productVariant: ProductVariantForPayment | null;
  product: {
    name: string;
  } | null;
};

type OrderForPaymentWebhook = {
  id: string;
  paymentStatus: string;
  deliveryQuoteId: string | null;
  items: OrderItemForPayment[];
};

function getPaystackSecret() {
  const mode = process.env.PAYSTACK_MODE ?? "test";
  const secret =
    mode === "live"
      ? process.env.PAYSTACK_SECRET_KEY_LIVE
      : process.env.PAYSTACK_SECRET_KEY_TEST;

  if (!secret) {
    throw new Error("Paystack secret key not set for current mode");
  }

  return secret;
}

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;

  const secret = getPaystackSecret();
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  return hash === signature;
}

async function markMarketplaceOrderReadyForVendorPreparation(orderId: string) {
  await prisma.delivery.upsert({
    where: { orderId },
    update: {
      processingStatus: "QUEUED",
      requiresManualDispatch: false,
      scheduledDispatchAt: null,
      dispatchDeferredReason: "WAITING_FOR_VENDOR_READY",
    },
    create: {
      orderId,
      partner: "KWIK",
      status: "CREATED",
      processingStatus: "QUEUED",
      requiresManualDispatch: false,
      dispatchDeferredReason: "WAITING_FOR_VENDOR_READY",
    },
  });
}

async function prepareMarketplaceOrderForVendors(orderId: string) {
  await markMarketplaceOrderReadyForVendorPreparation(orderId);
  return createVendorOrdersForPaidMarketplaceOrder(orderId);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature)) {
      return NextResponse.json(
        { ok: false, message: "Invalid signature" },
        { status: 401 }
      );
    }

    const event: unknown = JSON.parse(rawBody);
    const eventRecord = event as { event?: unknown; data?: { reference?: unknown } };

    if (eventRecord.event !== "charge.success") {
      return NextResponse.json({ ok: true, message: "Ignored event" }, { status: 200 });
    }

    const reference =
      typeof eventRecord.data?.reference === "string" ? eventRecord.data.reference : null;

    if (!reference) {
      return NextResponse.json(
        { ok: false, message: "Missing reference" },
        { status: 400 }
      );
    }

    const order = (await prisma.order.findFirst({
      where: { paymentReference: reference },
      include: {
        items: {
          include: {
            productVariant: true,
            product: true,
          },
        },
        delivery: true,
      },
    })) as OrderForPaymentWebhook | null;

    if (!order) {
      return NextResponse.json(
        { ok: false, message: "Order not found" },
        { status: 404 }
      );
    }

    if (order.paymentStatus === "PAID") {
      if (order.deliveryQuoteId) {
        const vendorOrderResult = await prepareMarketplaceOrderForVendors(order.id);
        return NextResponse.json(
          {
            ok: true,
            message: "Already processed. Marketplace vendor orders confirmed.",
            vendorOrders: vendorOrderResult,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { ok: true, message: "Already processed" },
        { status: 200 }
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const variant = item.productVariant;

        if (!variant || variant.stockQty === null) continue;

        const updated = await tx.productVariant.updateMany({
          where: {
            id: variant.id,
            stockQty: { gte: item.quantity },
          },
          data: {
            stockQty: {
              decrement: item.quantity,
            },
          },
        });

        if (updated.count !== 1) {
          throw new Error(
            `Insufficient stock for ${item.product?.name ?? "product"} - ${variant.name}`
          );
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "PROCESSING",
          paidAt: new Date(),
        },
      });
    });

    if (order.deliveryQuoteId) {
      const vendorOrderResult = await prepareMarketplaceOrderForVendors(order.id);

      return NextResponse.json(
        {
          ok: true,
          message:
            "Payment confirmed. Marketplace order is waiting for vendors to mark packages ready for pickup.",
          vendorOrders: vendorOrderResult,
        },
        { status: 200 }
      );
    }

    const now = new Date();
    const withinWindow = isWithinDeliveryWindow(now);

    if (withinWindow) {
      await prisma.delivery.upsert({
        where: { orderId: order.id },
        update: {
          processingStatus: "READY_FOR_DISPATCH",
          requiresManualDispatch: false,
          scheduledDispatchAt: null,
          dispatchDeferredReason: null,
        },
        create: {
          orderId: order.id,
          partner: "KWIK",
          status: "CREATED",
          processingStatus: "READY_FOR_DISPATCH",
          requiresManualDispatch: false,
        },
      });

      await createDeliveryFromOrder(order.id);

      return NextResponse.json(
        {
          ok: true,
          message: "Payment confirmed and delivery dispatch started",
        },
        { status: 200 }
      );
    }

    const scheduledDispatchAt = getNextDeliveryWindowStart(now);

    await prisma.delivery.upsert({
      where: { orderId: order.id },
      update: {
        processingStatus: "QUEUED",
        requiresManualDispatch: true,
        scheduledDispatchAt,
        dispatchDeferredReason: "OUTSIDE_DELIVERY_WINDOW",
      },
      create: {
        orderId: order.id,
        partner: "KWIK",
        status: "CREATED",
        processingStatus: "QUEUED",
        requiresManualDispatch: true,
        scheduledDispatchAt,
        dispatchDeferredReason: "OUTSIDE_DELIVERY_WINDOW",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Payment confirmed. Order queued for the next delivery window.",
        scheduledDispatchAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("PAYSTACK_WEBHOOK_ERROR", err);

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Something went wrong";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
