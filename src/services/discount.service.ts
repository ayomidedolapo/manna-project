import { prisma } from "@/lib/prisma"
import type { Discount } from "@prisma/client"

export async function getActiveDiscounts() {
  const now = new Date()

  return prisma.discount.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "desc" }, // latest campaign wins
  })
}

export function applyDiscountToAmount(amount: number, discount?: Discount | null) {
  if (!discount) return amount

  let off = 0

  if (discount.type === "PERCENTAGE" && discount.percentageOff) {
    off = Math.floor((discount.percentageOff / 100) * amount)
  } else if (discount.type === "FIXED" && discount.fixedAmountOff) {
    off = discount.fixedAmountOff
  }

  return Math.max(amount - off, 0)
}

/**
 * Applies discount to a single price value.
 * (Same logic as applyDiscountToAmount, just clearer naming for product prices.)
 */
export function applyDiscountToPriceNgn(priceNgn: number, discount?: Discount | null) {
  return applyDiscountToAmount(priceNgn, discount)
}

/**
 * Checks whether a discount applies to a given productId
 * based on your schema: appliesToAll OR productIds(Json array).
 */
export function isDiscountEligibleForProduct(
  discount: Discount | null | undefined,
  productId: string
) {
  if (!discount) return false
  if (discount.appliesToAll) return true
  if (!discount.productIds) return false

  const ids = discount.productIds as unknown as string[]
  return Array.isArray(ids) && ids.includes(productId)
}
