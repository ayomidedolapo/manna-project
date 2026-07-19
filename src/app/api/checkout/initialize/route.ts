import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAuthToken } from "@/lib/auth";
import { createMarketplacePendingOrderFromQuote } from "@/lib/checkout/marketplaceCheckout";

const BodySchema = z.object({
  deliveryQuoteId: z.string().uuid(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
  deliveryAddress1: z.string().min(3),
  deliveryAddress2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  deliveryNote: z.string().optional(),
  deliveryLat: z.number(),
  deliveryLng: z.number(),
});

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const result = await createMarketplacePendingOrderFromQuote({
      userId: decoded.userId,
      deliveryQuoteId: body.deliveryQuoteId,
      items: body.items,
      deliveryAddress1: body.deliveryAddress1,
      deliveryAddress2: body.deliveryAddress2,
      city: body.city,
      state: body.state,
      deliveryNote: body.deliveryNote,
      deliveryLat: body.deliveryLat,
      deliveryLng: body.deliveryLng,
    });

    return NextResponse.json(
      {
        ok: true,
        order: {
          id: result.order.id,
          orderNumber: result.order.orderNumber,
          status: result.order.status,
          paymentStatus: result.order.paymentStatus,
          deliveryQuoteId: body.deliveryQuoteId,
          totals: result.totals,
        },
        deliveryQuote: result.deliveryQuote,
        pricing: {
          currency: result.pricing.currency,
          totals: result.totals,
          items: result.pricing.items,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Something went wrong";

    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
