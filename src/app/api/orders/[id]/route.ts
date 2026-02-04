import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

export async function GET(
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
      include: {
        items: {
          include: {
            product: true,
            productVariant: true,
          },
        },
      },
    });

    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    // Only owner (or admin)
    const isOwner = order.userId === decoded.userId;
    const isAdmin = decoded.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, order }, { status: 200 });
  } catch (err) {
    console.error("GET_ORDER_ERROR", err);
    return NextResponse.json({ ok: false, message: "Something went wrong" }, { status: 500 });
  }
}
