import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActiveDiscounts,
  applyDiscountToPriceNgn,
  isDiscountEligibleForProduct,
} from "@/services/discount.service";

type ProductVariantForList = {
  id: string;
  priceNgn: number;
  [key: string]: unknown;
};

type ProductForList = {
  id: string;
  variants: ProductVariantForList[];
  [key: string]: unknown;
};

export async function GET(req: NextRequest) {
  const marketClusterId = req.nextUrl.searchParams.get("marketClusterId");
  const [discount] = await getActiveDiscounts();

  const where: Record<string, unknown> = {
    isActive: true,
    approvalStatus: "APPROVED",
    OR: [
      { vendorId: null },
      { vendor: { status: "APPROVED", isActive: true, isVisible: true } },
    ],
  };

  if (marketClusterId) {
    where.marketClusterId = marketClusterId;
  }

  const products = (await prisma.product.findMany({
    where: where as never,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    include: {
      variants: true,
      vendor: {
        select: {
          id: true,
          displayName: true,
          slug: true,
          logoUrl: true,
        },
      },
      marketCluster: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          state: true,
        },
      },
    },
  })) as ProductForList[];

  const mappedProducts = products.map((product: ProductForList) => {
    const eligible = isDiscountEligibleForProduct(discount, product.id);

    return {
      ...product,
      variants: product.variants.map((variant: ProductVariantForList) => {
        const originalPriceNgn = variant.priceNgn;
        const discountedPriceNgn = eligible
          ? applyDiscountToPriceNgn(originalPriceNgn, discount)
          : originalPriceNgn;

        return {
          ...variant,
          originalPriceNgn,
          discountedPriceNgn,
          hasDiscount: discountedPriceNgn < originalPriceNgn,
        };
      }),
    };
  });

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
  });
}
