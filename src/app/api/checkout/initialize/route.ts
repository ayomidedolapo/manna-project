import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { priceCart } from "@/lib/checkout/priceCart";

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

const BodySchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantity: z.number().int().min(1),
    })
  ).min(1),

  deliveryAddress1: z.string().min(3),
  deliveryAddress2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  deliveryNote: z.string().optional(),
});

function makeOrderNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `MAN-${y}${m}${day}-${nanoid()}`;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // ✅ Auth (same pattern as /auth/me)
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    let userId: string | null = null;
    if (token) {
      const decoded = verifyAuthToken(token);
      if (decoded?.userId) userId = decoded.userId;
    }

    // 1) Server pricing
    const pricing = await priceCart(body.items);

    // 2) Delivery fee (MVP = 0, you can compute later with KWIK)
    const deliveryFeeNgn = 0;

    // 3) Transaction: re-check stock + create order + order items
    const order = await prisma.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: body.items.map((i) => i.variantId) } },
        include: { product: true },
      });

      for (const ci of body.items) {
        const v = variants.find((x) => x.id === ci.variantId);
        if (!v) throw new Error("Variant not found");

        if (v.stockQty !== null && v.stockQty !== undefined) {
          if (v.stockQty < ci.quantity) {
            throw new Error(`Insufficient stock for ${v.product.name} - ${v.name}`);
          }
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          userId,

          status: "PENDING_PAYMENT",
          paymentStatus: "PENDING",

          totalAmountNgn: pricing.itemsTotal + deliveryFeeNgn,
          deliveryFeeNgn,

          deliveryAddress1: body.deliveryAddress1,
          deliveryAddress2: body.deliveryAddress2 ?? null,
          city: body.city,
          state: body.state,
          deliveryNote: body.deliveryNote ?? null,

          deliveryPartner: "KWIK",

          items: {
            create: pricing.items.map((i) => ({
              productId: i.productId,
              productVariantId: i.variantId,
              quantity: i.quantity,

              // your schema: unitPriceNgn + subtotalNgn
              unitPriceNgn: i.finalUnitPrice,
              subtotalNgn: i.lineTotal,
            })),
          },
        },
        include: { items: true },
      });

      return created;
    });

    return NextResponse.json(
      {
        ok: true,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totals: {
            subtotal: pricing.subtotal,
            discountTotal: pricing.discountTotal,
            itemsTotal: pricing.itemsTotal,
            deliveryFeeNgn,
            totalAmountNgn: order.totalAmountNgn,
          },
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    return NextResponse.json(
      { ok: false, message },
      { status: 400 }
    );
  }
}
