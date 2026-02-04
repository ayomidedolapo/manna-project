import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

const BodySchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmountNgn: true,
        paymentReference: true,
        updatedAt: true,
      },
    });

    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    // only owner or admin
    const full = await prisma.order.findUnique({ where: { id: body.orderId }, select: { userId: true } });
    const isOwner = full?.userId === decoded.userId;
    const isAdmin = decoded.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, order }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
