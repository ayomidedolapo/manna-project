import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveDiscounts, isDiscountEligibleForProduct, applyDiscountDetailed } from "@/services/discount.service";

type ActiveDiscount = Awaited<ReturnType<typeof getActiveDiscounts>> extends Array<infer T> ? T : never;

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),

  // optional for now (later you’ll use for KWIK delivery fee calc)
  deliveryAddress1: z.string().min(3).optional(),
  deliveryAddress2: z.string().optional(),
  city: z.string().min(2).optional(),
  state: z.string().min(2).optional(),
  deliveryNote: z.string().optional(),
});

function pickDiscountForProduct(discounts: ActiveDiscount[], productId: string) {
  const productSpecific = discounts.find(
    (d) => !d.appliesToAll && isDiscountEligibleForProduct(d, productId)
  );
  if (productSpecific) return productSpecific;

  const global = discounts.find((d) => d.appliesToAll);
  return global ?? null;
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    // Load variants (server truth)
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: body.items.map((i) => i.variantId) } },
      include: { product: true },
    });

    const map = new Map(variants.map((v) => [v.id, v]));

    // Load all active discounts once
    const discounts = await getActiveDiscounts();

    let totalItems = 0;
    let subtotalBeforeDiscount = 0;
    let discountTotal = 0;
    let itemsTotal = 0;

    const lines = body.items.map((ci) => {
      const v = map.get(ci.variantId);
      if (!v) throw new Error(`Variant not found: ${ci.variantId}`);

      // Stock sanity (preview can still warn early)
      if (v.stockQty !== null && v.stockQty !== undefined && v.stockQty < ci.quantity) {
        throw new Error(`Insufficient stock for ${v.product.name} - ${v.name}`);
      }

      totalItems += ci.quantity;

      const originalUnitPriceNgn = v.priceNgn;

      const discount = pickDiscountForProduct(discounts, v.productId);
      const { finalAmount: discountedUnitPriceNgn, discountAmount: discountAmountPerUnitNgn } =
        applyDiscountDetailed(originalUnitPriceNgn, discount);

      const lineSubtotalBeforeDiscountNgn = originalUnitPriceNgn * ci.quantity;
      const lineDiscountNgn = discountAmountPerUnitNgn * ci.quantity;
      const lineTotalAfterDiscountNgn = discountedUnitPriceNgn * ci.quantity;

      subtotalBeforeDiscount += lineSubtotalBeforeDiscountNgn;
      discountTotal += lineDiscountNgn;
      itemsTotal += lineTotalAfterDiscountNgn;

      return {
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        variantName: v.name,
        quantity: ci.quantity,

        originalUnitPriceNgn,
        discountedUnitPriceNgn,
        discountAmountPerUnitNgn,

        lineSubtotalBeforeDiscountNgn,
        lineDiscountNgn,
        lineTotalAfterDiscountNgn,

        appliedDiscount: discount
          ? {
              id: discount.id,
              title: discount.title,
              type: discount.type,
              percentageOff: discount.percentageOff,
              fixedAmountOff: discount.fixedAmountOff,
              appliesToAll: discount.appliesToAll,
              productIds: discount.productIds,
              startsAt: discount.startsAt,
              endsAt: discount.endsAt,
            }
          : null,
      };
    });

    // Delivery fee (MVP = 0). Later: compute via KWIK with address/coords.
    const deliveryFeeNgn = 0;
    const totalAmountNgn = itemsTotal + deliveryFeeNgn;

    return NextResponse.json(
      {
        ok: true,
        currency: "NGN",
        totals: {
          totalItems,
          subtotalBeforeDiscount,
          discountTotal,
          itemsTotal, // after discount
          deliveryFeeNgn,
          totalAmountNgn,
        },
        lines,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
