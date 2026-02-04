import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // ensure Node crypto is available

function getPaystackSecret() {
  const mode = process.env.PAYSTACK_MODE ?? "test";
  const secret =
    mode === "live"
      ? process.env.PAYSTACK_SECRET_KEY_LIVE
      : process.env.PAYSTACK_SECRET_KEY_TEST;

  if (!secret) throw new Error("Paystack secret key not set for current mode");
  return secret;
}

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;

  const secret = getPaystackSecret();
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

export async function POST(req: Request) {
  try {
    // IMPORTANT: read RAW body exactly
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // Only act on success (you can extend later)
    if (event?.event !== "charge.success") {
      return NextResponse.json({ ok: true, message: "Ignored event" }, { status: 200 });
    }

    const reference: string | undefined = event?.data?.reference;
    if (!reference) {
      return NextResponse.json({ ok: false, message: "Missing reference" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { paymentReference: reference },
      include: { items: { include: { productVariant: true, product: true } } },
    });

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    // Idempotency
    if (order.paymentStatus === "PAID") {
      return NextResponse.json({ ok: true, message: "Already processed" }, { status: 200 });
    }

    // Deduct stock + mark paid atomically
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const pv = item.productVariant;
        if (!pv) continue;

        if (pv.stockQty === null || pv.stockQty === undefined) continue;

        const updated = await tx.productVariant.updateMany({
          where: { id: pv.id, stockQty: { gte: item.quantity } },
          data: { stockQty: { decrement: item.quantity } },
        });

        if (updated.count !== 1) {
          throw new Error(`Insufficient stock while processing payment for ${item.product.name} - ${pv.name}`);
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", status: "PROCESSING" },
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";

    return NextResponse.json(
      { ok: false, message },
      { status: 400 }
    );
  }
}
