// src/app/api/orders/[id]/status/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

const BodySchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "PROCESSING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
});

function canTransition(from: string, to: string) {
  // ✅ Simple safe rules (MVP)
  // - Paid orders move forward
  // - Delivered is final
  // - Cancel allowed only before delivery
  if (from === to) return true;

  if (from === "DELIVERED") return false;

  const allowed: Record<string, string[]> = {
    PENDING_PAYMENT: ["CANCELLED"],
    PROCESSING: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    CANCELLED: [],
    DELIVERED: [],
  };

  return (allowed[from] ?? []).includes(to);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());

    // Auth
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    const decoded = token ? verifyAuthToken(token) : null;

    if (!decoded?.userId) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    // Admin only
    if (decoded.role !== "ADMIN") {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, paymentStatus: true },
    });

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    // Extra guard: don't allow moving unpaid orders into fulfilment stages
    if (order.paymentStatus !== "PAID" && ["PROCESSING", "OUT_FOR_DELIVERY", "DELIVERED"].includes(body.status)) {
      return NextResponse.json(
        { ok: false, message: "Cannot move an unpaid order into fulfilment" },
        { status: 409 }
      );
    }

    if (!canTransition(order.status, body.status)) {
      return NextResponse.json(
        { ok: false, message: `Invalid status transition: ${order.status} -> ${body.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: body.status },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, order: updated }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    return NextResponse.json(
      { ok: false, message },
      { status: 400 }
    );
  }
}
