import { prisma } from "@/lib/prisma";
import type { Discount } from "@prisma/client";

export async function getActiveDiscounts() {
  const now = new Date();

  return prisma.discount.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    // latest campaign wins
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Checks whether a discount applies to a given productId
 * based on your schema: appliesToAll OR productIds(Json array).
 */
export function isDiscountEligibleForProduct(
  discount: Discount | null | undefined,
  productId: string
) {
  if (!discount) return false;
  if (discount.appliesToAll) return true;
  if (!discount.productIds) return false;

  const ids = discount.productIds as unknown as string[];
  return Array.isArray(ids) && ids.includes(productId);
}

/**
 * Returns the best applicable discount for a product:
 * Priority: product-specific > appliesToAll
 * If multiple, latest campaign wins (because getActiveDiscounts() is sorted desc).
 */
export async function getActiveDiscountForProduct(productId: string) {
  const discounts = await getActiveDiscounts();

  const productSpecific = discounts.find(
    (d) => !d.appliesToAll && isDiscountEligibleForProduct(d, productId)
  );
  if (productSpecific) return productSpecific;

  const global = discounts.find((d) => d.appliesToAll);
  return global ?? null;
}

/**
 * ✅ Backward-compatible alias (fixes your import error)
 * Some routes may still import getActiveDiscountsForProduct
 */
export const getActiveDiscountsForProduct = getActiveDiscountForProduct;

/**
 * Applies discount to an amount and returns both:
 * - finalAmount
 * - discountAmount
 */
export function applyDiscountDetailed(amount: number, discount?: Discount | null) {
  if (!discount) {
    return { finalAmount: amount, discountAmount: 0 };
  }

  let off = 0;

  if (discount.type === "PERCENTAGE" && discount.percentageOff) {
    off = Math.floor((discount.percentageOff / 100) * amount);
  } else if (discount.type === "FIXED" && discount.fixedAmountOff) {
    off = discount.fixedAmountOff;
  }

  off = Math.max(0, off);
  const finalAmount = Math.max(amount - off, 0);

  return { finalAmount, discountAmount: Math.min(off, amount) };
}

/**
 * Convenience for prices
 */
export function applyDiscountToPriceNgn(
  priceNgn: number,
  discount?: Discount | null
) {
  return applyDiscountDetailed(priceNgn, discount).finalAmount;
}
