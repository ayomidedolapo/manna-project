import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  getActiveDiscounts,
  applyDiscountToPriceNgn,
  isDiscountEligibleForProduct,
} from "@/services/discount.service"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params
    const [discount] = await getActiveDiscounts()

    const product = await prisma.product.findUnique({
      where: { slug },
      include: { variants: true },
    })

    if (!product || !product.isActive) {
      return NextResponse.json({ message: "Not found" }, { status: 404 })
    }

    const eligible = isDiscountEligibleForProduct(discount, product.id)

    const mapped = {
      ...product,
      variants: product.variants.map((v) => {
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

    return NextResponse.json({
      discount: discount
        ? { id: discount.id, title: discount.title, type: discount.type }
        : null,
      product: mapped,
    })
  } catch (e) {
    console.error("GET /api/products/[slug] error:", e)
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 })
  }
}
