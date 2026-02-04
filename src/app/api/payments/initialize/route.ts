// src/app/api/payments/initialize/route.ts
import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  try {
    // ✅ If request has no JSON body, this will throw
    const body = BodySchema.parse(await req.json());

    // Auth
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    const decoded = token ? verifyAuthToken(token) : null;

    if (!decoded?.userId) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        totalAmountNgn: true,
        orderNumber: true,
        paymentReference: true,
      },
    });

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    const isOwner = order.userId && order.userId === decoded.userId;
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

    // Ensure payment reference exists
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

    // Paystack secret
    const { secret, mode } = getPaystackSecret();

    // ✅ Paystack needs a valid email
    const user = updated.userId
      ? await prisma.user.findUnique({
          where: { id: updated.userId },
          select: { email: true, phone: true },
        })
      : null;

    const email = user?.email && user.email.includes("@")
      ? user.email
      : "test@manna.com"; // ✅ valid fallback

    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        reference: updated.paymentReference,
        amount: updated.totalAmountNgn * 100, // kobo
        email,
        currency: "NGN",
        metadata: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
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
    // ✅ Show Paystack’s real error message if axios fails
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ message?: string; error?: string }>;
      const status = ax.response?.status ?? 400;
      const paystackMessage =
        ax.response?.data?.message ??
        ax.response?.data?.error ??
        ax.message;

      return NextResponse.json(
        { ok: false, message: `Paystack error: ${paystackMessage}` },
        { status }
      );
    }

    // Zod errors come here too
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Something went wrong";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
