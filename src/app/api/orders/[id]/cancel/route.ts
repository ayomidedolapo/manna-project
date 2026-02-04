import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, paymentStatus: true },
    });

    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    const isOwner = order.userId === decoded.userId;
    const isAdmin = decoded.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    if (!(order.status === "PENDING_PAYMENT" && order.paymentStatus === "PENDING")) {
      return NextResponse.json(
        { ok: false, message: "Only unpaid pending orders can be cancelled" },
        { status: 409 }
      );
    }

    await prisma.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("CANCEL_ORDER_ERROR", err);
    return NextResponse.json({ ok: false, message: "Something went wrong" }, { status: 500 });
  }
}
