import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import {
  getActiveDiscounts,
  isDiscountEligibleForProduct,
  applyDiscountDetailed,
} from "@/services/discount.service";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    // Ensure cart exists
    const cart = await prisma.cart.upsert({
      where: { userId: decoded.userId },
      create: { userId: decoded.userId },
      update: {},
      select: {
        id: true,
        updatedAt: true,
        items: {
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            quantity: true,
            createdAt: true,
            updatedAt: true,
            productId: true,
            product: {
              select: { id: true, name: true, slug: true, imageUrl: true },
            },
            productVariant: {
              select: {
                id: true,
                name: true,
                unit: true,
                unitWeightKg: true,
                priceNgn: true,
                stockQty: true,
              },
            },
          },
        },
      },
    });

    // Fetch all active discounts once
    const discounts = await getActiveDiscounts();

    // helper to pick best discount for product:
    // priority: product-specific > appliesToAll
    const pickDiscountForProduct = (productId: string) => {
      const productSpecific = discounts.find(
        (d) => !d.appliesToAll && isDiscountEligibleForProduct(d, productId)
      );
      if (productSpecific) return productSpecific;

      const global = discounts.find((d) => d.appliesToAll);
      return global ?? null;
    };

    let totalItems = 0;

    let subtotalBeforeDiscountNgn = 0;
    let discountTotalNgn = 0;
    let subtotalAfterDiscountNgn = 0;

    const items = cart.items.map((item) => {
      // You price by variant. If no variant, unit price is 0 (same as your previous logic)
      const originalUnitPriceNgn = item.productVariant?.priceNgn ?? 0;

      const appliedDiscount = pickDiscountForProduct(item.productId);

      const { finalAmount: discountedUnitPriceNgn, discountAmount: discountAmountPerUnitNgn } =
        applyDiscountDetailed(originalUnitPriceNgn, appliedDiscount);

      const lineBefore = originalUnitPriceNgn * item.quantity;
      const lineAfter = discountedUnitPriceNgn * item.quantity;
      const lineDiscount = discountAmountPerUnitNgn * item.quantity;

      totalItems += item.quantity;
      subtotalBeforeDiscountNgn += lineBefore;
      discountTotalNgn += lineDiscount;
      subtotalAfterDiscountNgn += lineAfter;

      return {
        id: item.id,
        quantity: item.quantity,

        originalUnitPriceNgn,
        discountedUnitPriceNgn,
        discountAmountPerUnitNgn,

        lineTotalBeforeDiscountNgn: lineBefore,
        lineDiscountNgn: lineDiscount,
        lineTotalAfterDiscountNgn: lineAfter,

        product: item.product,
        variant: item.productVariant,

        appliedDiscount: appliedDiscount
          ? {
              id: appliedDiscount.id,
              title: appliedDiscount.title,
              type: appliedDiscount.type,
              percentageOff: appliedDiscount.percentageOff,
              fixedAmountOff: appliedDiscount.fixedAmountOff,
              appliesToAll: appliedDiscount.appliesToAll,
              productIds: appliedDiscount.productIds,
              startsAt: appliedDiscount.startsAt,
              endsAt: appliedDiscount.endsAt,
            }
          : null,

        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return NextResponse.json(
      {
        cart: { id: cart.id, updatedAt: cart.updatedAt },
        summary: {
          totalItems,
          currency: "NGN",

          subtotalBeforeDiscountNgn,
          discountTotalNgn,
          subtotalAfterDiscountNgn,
        },
        items,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("CART_SUMMARY_ERROR", error);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
