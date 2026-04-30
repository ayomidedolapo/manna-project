import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDeliveryFromOrder } from "@/lib/delivery/createDeliveryFromOrder";
import {
  isWithinDeliveryWindow,
  getNextDeliveryWindowStart,
} from "@/lib/delivery/deliveryWindow";

export const runtime = "nodejs";

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

  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  return hash === signature;
}

export async function POST(req: Request) {
  try {
    console.log("🔔 PAYSTACK WEBHOOK HIT");

    // IMPORTANT: Read raw body exactly once
    const rawBody = await req.text();

    const signature = req.headers.get("x-paystack-signature");
    console.log("Signature present:", !!signature);

    if (!verifyPaystackSignature(rawBody, signature)) {
      console.log("❌ Invalid Paystack signature");
      return NextResponse.json(
        { ok: false, message: "Invalid signature" },
        { status: 401 }
      );
    }

    console.log("✅ Signature verified");

    const event = JSON.parse(rawBody);

    console.log("Event type:", event?.event);

    if (event?.event !== "charge.success") {
      console.log("Ignored event:", event?.event);
      return NextResponse.json(
        { ok: true, message: "Ignored event" },
        { status: 200 }
      );
    }

    const reference: string | undefined = event?.data?.reference;

    console.log("Payment reference:", reference);

    if (!reference) {
      return NextResponse.json(
        { ok: false, message: "Missing reference" },
        { status: 400 }
      );
    }

    const order = await prisma.order.findFirst({
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
    });

    console.log("Order found:", !!order);

    if (!order) {
      return NextResponse.json(
        { ok: false, message: "Order not found" },
        { status: 404 }
      );
    }

    // Prevent double processing
    if (order.paymentStatus === "PAID") {
      console.log("⚠️ Order already processed");
      return NextResponse.json(
        { ok: true, message: "Already processed" },
        { status: 200 }
      );
    }

    console.log("Processing payment for order:", order.id);

    // Deduct stock + mark order paid
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const pv = item.productVariant;

        if (!pv) continue;
        if (pv.stockQty == null) continue;

        const updated = await tx.productVariant.updateMany({
          where: {
            id: pv.id,
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
            `Insufficient stock for ${item.product?.name ?? "product"}`
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

    console.log("✅ Order marked as PAID");

    const now = new Date();

    const withinWindow = isWithinDeliveryWindow(now);

    console.log("Within delivery window:", withinWindow);

    if (withinWindow) {
      console.log("🚚 Auto dispatching delivery");

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

      console.log("✅ KWIK delivery created");

      return NextResponse.json(
        {
          ok: true,
          message: "Payment confirmed and delivery dispatch started",
        },
        { status: 200 }
      );
    }

    // Outside delivery window
    console.log("📦 Queueing delivery (outside delivery window)");

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

    console.log("📅 Delivery queued for:", scheduledDispatchAt);

    return NextResponse.json(
      {
        ok: true,
        message:
          "Payment confirmed. Order queued for manual dispatch in the next delivery window.",
        scheduledDispatchAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("❌ PAYSTACK WEBHOOK ERROR:", err);

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Something went wrong";

    return NextResponse.json(
      { ok: false, message },
      { status: 400 }
    );
  }
}