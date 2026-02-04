import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return NextResponse.json({ ok: true, orders: [] }, { status: 200 });

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return NextResponse.json({ ok: true, orders: [] }, { status: 200 });

    const orders = await prisma.order.findMany({
      where: { userId: decoded.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmountNgn: true,
        deliveryFeeNgn: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, orders }, { status: 200 });
  } catch (err) {
    console.error("GET_ORDERS_ERROR", err);
    return NextResponse.json({ ok: false, message: "Something went wrong" }, { status: 500 });
  }
}
