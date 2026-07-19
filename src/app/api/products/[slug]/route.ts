import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActiveDiscounts,
  applyDiscountToPriceNgn,
  isDiscountEligibleForProduct,
} from "@/services/discount.service";

type ProductVariantForDetail = {
  id: string;
  priceNgn: number;
  [key: string]: unknown;
};

type ProductForDetail = {
  id: string;
  isActive: boolean;
  approvalStatus: string;
  vendorId: string | null;
  variants: ProductVariantForDetail[];
  vendor: {
    id: string;
    displayName: string;
    slug: string;
    status: string;
    isActive: boolean;
    isVisible: boolean;
  } | null;
  [key: string]: unknown;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const [discount] = await getActiveDiscounts();

    const product = (await prisma.product.findUnique({
      where: { slug },
      include: {
        variants: true,
        vendor: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            status: true,
            isActive: true,
            isVisible: true,
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
    })) as ProductForDetail | null;

    const vendorUnavailable =
      product?.vendor &&
      (product.vendor.status !== "APPROVED" ||
        !product.vendor.isActive ||
        !product.vendor.isVisible);

    if (
      !product ||
      !product.isActive ||
      product.approvalStatus !== "APPROVED" ||
      vendorUnavailable
    ) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const eligible = isDiscountEligibleForProduct(discount, product.id);

    const mapped = {
      ...product,
      variants: product.variants.map((variant: ProductVariantForDetail) => {
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

    return NextResponse.json({
      discount: discount
        ? { id: discount.id, title: discount.title, type: discount.type }
        : null,
      product: mapped,
    });
  } catch (error: unknown) {
    console.error("GET /api/products/[slug] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}
