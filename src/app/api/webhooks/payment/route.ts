import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // important for crypto

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;

  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  return hash === signature;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text(); // must be RAW
    const signature = req.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // Paystack success event is usually: "charge.success"
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

    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    // idempotent
    if (order.paymentStatus === "PAID") {
      return NextResponse.json({ ok: true, message: "Already processed" }, { status: 200 });
    }

    await prisma.$transaction(async (tx) => {
      // deduct stock
      for (const item of order.items) {
        const pv = item.productVariant;
        if (!pv) continue;
        if (pv.stockQty === null || pv.stockQty === undefined) continue;

        const updated = await tx.productVariant.updateMany({
          where: { id: pv.id, stockQty: { gte: item.quantity } },
          data: { stockQty: { decrement: item.quantity } },
        });

        if (updated.count !== 1) {
          throw new Error(`Insufficient stock: ${item.product.name} - ${pv.name}`);
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", status: "PROCESSING" },
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    let message = "Something went wrong";
    if (err instanceof Error && err.message) {
      message = err.message;
    } else if (typeof err === "string") {
      message = err;
    }

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
