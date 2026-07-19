// src/app/api/payments/initialize/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import axios, { AxiosError } from "axios";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

export const runtime = "nodejs";

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 14);

const BodySchema = z.object({
  orderId: z.string().uuid(),
});

type OrderForPayment = {
  id: string;
  userId: string | null;
  status: string;
  paymentStatus: string;
  totalAmountNgn: number;
  deliveryFeeNgn: number;
  orderNumber: string;
  paymentReference: string | null;
  deliveryQuoteId: string | null;
  deliveryQuoteExpiresAt: Date | null;
  marketClusterId: string | null;
};

type DeliveryQuoteForPayment = {
  id: string;
  userId: string | null;
  orderId: string | null;
  marketClusterId: string;
  status: string;
  quoteExpiresAt: Date;
  amountToChargeCustomerNgn: number;
};

function makePaymentReference() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `PAY-MAN-${y}${m}${day}-${nanoid()}`;
}

function getPaystackSecret() {
  const mode = process.env.PAYSTACK_MODE ?? "test";
  const secret =
    mode === "live"
      ? process.env.PAYSTACK_SECRET_KEY_LIVE
      : process.env.PAYSTACK_SECRET_KEY_TEST;

  if (!secret) throw new Error(`Missing Paystack secret key for mode: ${mode}`);
  return { secret, mode };
}

async function validateDeliveryQuoteBeforePayment(order: OrderForPayment, userId: string) {
  if (!order.deliveryQuoteId) {
    throw new Error("Create a valid Kwik delivery quote before initializing payment");
  }

  const quote = (await prisma.deliveryQuote.findUnique({
    where: { id: order.deliveryQuoteId },
    select: {
      id: true,
      userId: true,
      orderId: true,
      marketClusterId: true,
      status: true,
      quoteExpiresAt: true,
      amountToChargeCustomerNgn: true,
    },
  })) as DeliveryQuoteForPayment | null;

  if (!quote) {
    throw new Error("Delivery quote not found. Request a new quote.");
  }

  if (quote.userId !== userId) {
    throw new Error("Delivery quote does not belong to this customer");
  }

  if (quote.orderId !== order.id) {
    throw new Error("Delivery quote is not locked to this order");
  }

  if (quote.status !== "USED") {
    throw new Error("Delivery quote is not locked for payment");
  }

  if (quote.quoteExpiresAt.getTime() <= Date.now()) {
    throw new Error("Delivery quote has expired. Request a new quote before payment.");
  }

  if (order.deliveryQuoteExpiresAt && order.deliveryQuoteExpiresAt.getTime() <= Date.now()) {
    throw new Error("Order delivery quote has expired. Request a new quote before payment.");
  }

  if (order.marketClusterId !== quote.marketClusterId) {
    throw new Error("Order market cluster does not match the delivery quote");
  }

  if (order.deliveryFeeNgn !== quote.amountToChargeCustomerNgn) {
    throw new Error("Order delivery fee no longer matches the Kwik quote");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    const decoded = token ? verifyAuthToken(token) : null;

    if (!decoded?.userId) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const order = (await prisma.order.findUnique({
      where: { id: body.orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        totalAmountNgn: true,
        deliveryFeeNgn: true,
        orderNumber: true,
        paymentReference: true,
        deliveryQuoteId: true,
        deliveryQuoteExpiresAt: true,
        marketClusterId: true,
      },
    })) as OrderForPayment | null;

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    const isOwner = order.userId === decoded.userId;
    const isAdmin = decoded.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    if (order.status !== "PENDING_PAYMENT" || order.paymentStatus !== "PENDING") {
      return NextResponse.json(
        { ok: false, message: "Order is not eligible for payment" },
        { status: 409 }
      );
    }

    if (!Number.isInteger(order.totalAmountNgn) || order.totalAmountNgn <= 0) {
      return NextResponse.json(
        { ok: false, message: "Order amount is invalid" },
        { status: 400 }
      );
    }

    await validateDeliveryQuoteBeforePayment(order, decoded.userId);

    const paymentReference = order.paymentReference ?? makePaymentReference();

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { paymentReference },
      select: {
        id: true,
        orderNumber: true,
        totalAmountNgn: true,
        paymentReference: true,
        userId: true,
      },
    });

    const { secret, mode } = getPaystackSecret();

    const user = updated.userId
      ? await prisma.user.findUnique({
          where: { id: updated.userId },
          select: { email: true, phone: true },
        })
      : null;

    const email = user?.email && user.email.includes("@") ? user.email : "test@manna.com";

    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        reference: updated.paymentReference,
        amount: updated.totalAmountNgn * 100,
        email,
        currency: "NGN",
        metadata: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          deliveryQuoteId: order.deliveryQuoteId,
          mode,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const data = paystackRes.data?.data;

    return NextResponse.json(
      {
        ok: true,
        payment: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          amountNgn: updated.totalAmountNgn,
          reference: updated.paymentReference,
          authorizationUrl: data?.authorization_url,
          accessCode: data?.access_code,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ message?: string; error?: string }>;
      const status = ax.response?.status ?? 400;
      const paystackMessage = ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message;

      return NextResponse.json(
        { ok: false, message: `Paystack error: ${paystackMessage}` },
        { status }
      );
    }

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Something went wrong";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
