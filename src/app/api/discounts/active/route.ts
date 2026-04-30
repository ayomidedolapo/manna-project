import { NextResponse } from "next/server";
import { getActiveDiscountsForProduct, getActiveDiscounts } from "@/services/discount.service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get("productId");

    if (productId) {
      const discount = await getActiveDiscountsForProduct(productId);

      return NextResponse.json({
        active: !!discount,
        discount: discount
          ? {
              id: discount.id,
              title: discount.title,
              description: discount.description,
              type: discount.type,
              percentageOff: discount.percentageOff,
              fixedAmountOff: discount.fixedAmountOff,
              appliesToAll: discount.appliesToAll,
              productIds: discount.productIds,
              startsAt: discount.startsAt,
              endsAt: discount.endsAt,
            }
          : null,
      });
    }

    const discounts = await getActiveDiscounts();

    return NextResponse.json({
      active: discounts.length > 0,
      discounts: discounts.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        type: d.type,
        percentageOff: d.percentageOff,
        fixedAmountOff: d.fixedAmountOff,
        appliesToAll: d.appliesToAll,
        productIds: d.productIds,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
      })),
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : String(e ?? "Failed to fetch active discount");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
