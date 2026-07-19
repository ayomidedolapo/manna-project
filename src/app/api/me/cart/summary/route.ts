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

type CartSummaryItem = {
  id: string;
  quantity: number;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    marketClusterId: string | null;
    vendor: {
      id: string;
      displayName: string;
      slug: string;
    } | null;
  };
  productVariant: {
    id: string;
    name: string;
    unit: string;
    unitWeightKg: number | null;
    priceNgn: number;
    stockQty: number | null;
  } | null;
};

type CartSummaryRecord = {
  id: string;
  updatedAt: Date;
  marketCluster: {
    id: string;
    name: string;
    slug: string;
    city: string;
    state: string;
  } | null;
  items: CartSummaryItem[];
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const cart = (await prisma.cart.upsert({
      where: { userId: decoded.userId },
      create: { userId: decoded.userId },
      update: {},
      select: {
        id: true,
        updatedAt: true,
        marketCluster: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            state: true,
          },
        },
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
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                marketClusterId: true,
                vendor: {
                  select: {
                    id: true,
                    displayName: true,
                    slug: true,
                  },
                },
              },
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
    })) as CartSummaryRecord;

    const discounts = await getActiveDiscounts();

    const pickDiscountForProduct = (productId: string) => {
      const productSpecific = discounts.find(
        (discount) =>
          !discount.appliesToAll &&
          isDiscountEligibleForProduct(discount, productId)
      );
      if (productSpecific) return productSpecific;

      const global = discounts.find((discount) => discount.appliesToAll);
      return global ?? null;
    };

    let totalItems = 0;
    let subtotalBeforeDiscountNgn = 0;
    let discountTotalNgn = 0;
    let subtotalAfterDiscountNgn = 0;

    const items = cart.items.map((item: CartSummaryItem) => {
      const originalUnitPriceNgn = item.productVariant?.priceNgn ?? 0;
      const appliedDiscount = pickDiscountForProduct(item.productId);

      const {
        finalAmount: discountedUnitPriceNgn,
        discountAmount: discountAmountPerUnitNgn,
      } = applyDiscountDetailed(originalUnitPriceNgn, appliedDiscount);

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
        cart: {
          id: cart.id,
          updatedAt: cart.updatedAt,
          marketCluster: cart.marketCluster,
        },
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
  } catch (error: unknown) {
    console.error("CART_SUMMARY_ERROR", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
