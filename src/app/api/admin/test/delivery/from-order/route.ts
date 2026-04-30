import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createDeliveryFromOrder } from "@/lib/delivery/createDeliveryFromOrder";

const BodySchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    // optional: ensure order is PAID before creating delivery
    if (order.paymentStatus !== "PAID") {
      return NextResponse.json(
        { ok: false, message: "Order must be PAID before delivery" },
        { status: 409 }
      );
    }

    const delivery = await createDeliveryFromOrder(order.id);

    return NextResponse.json({ ok: true, delivery }, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
