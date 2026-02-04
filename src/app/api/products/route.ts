import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  getActiveDiscounts,
  applyDiscountToPriceNgn,
  isDiscountEligibleForProduct,
} from "@/services/discount.service"

export async function GET() {
  const [discount] = await getActiveDiscounts()

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    include: { variants: true },
  })

  const mappedProducts = products.map((p) => {
    const eligible = isDiscountEligibleForProduct(discount, p.id)

    return {
      ...p,
      variants: p.variants.map((v) => {
        const originalPriceNgn = v.priceNgn
        const discountedPriceNgn = eligible
          ? applyDiscountToPriceNgn(originalPriceNgn, discount)
          : originalPriceNgn

        return {
          ...v,
          originalPriceNgn,
          discountedPriceNgn,
          hasDiscount: discountedPriceNgn < originalPriceNgn,
        }
      }),
    }
  })

  return NextResponse.json({
    discount: discount
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
    products: mappedProducts,
  })
}
