import { prisma } from "@/lib/prisma";
import {
  getActiveDiscounts,
  isDiscountEligibleForProduct,
  applyDiscountDetailed,
} from "@/services/discount.service";

type CartItemInput = { variantId: string; quantity: number };

type Discount = NonNullable<Parameters<typeof applyDiscountDetailed>[1]>;

type AppliedDiscountSummary = Pick<
  Discount,
  | "id"
  | "title"
  | "description"
  | "type"
  | "percentageOff"
  | "fixedAmountOff"
  | "appliesToAll"
  | "productIds"
  | "isActive"
  | "startsAt"
  | "endsAt"
  | "createdAt"
  | "updatedAt"
>;

function pickDiscountForProduct(discounts: Discount[], productId: string) {
  // Priority: product-specific > global
  const productSpecific = discounts.find(
    (d) => !d.appliesToAll && isDiscountEligibleForProduct(d, productId)
  );
  if (productSpecific) return productSpecific;

  const global = discounts.find((d) => d.appliesToAll);
  return global ?? null;
}

export async function priceCart(items: CartItemInput[]) {
  if (!items.length) throw new Error("Cart is empty");

  // Validate quantities early
  for (const i of items) {
    if (!i.variantId) throw new Error("variantId is required");
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error("Invalid quantity");
  }

  const variantIds = items.map((i) => i.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  if (variants.length !== variantIds.length) {
    throw new Error("One or more variants not found");
  }

  // ✅ Load active discounts once (already schedule-filtered in service)
  const discounts = await getActiveDiscounts();

  // Map variantId -> variant
  const vmap = new Map(variants.map((v) => [v.id, v]));

  const pricedItems = items.map((ci) => {
    const v = vmap.get(ci.variantId);
    if (!v) throw new Error(`Variant not found: ${ci.variantId}`);

    const qty = ci.quantity;

    // Stock check (null = not tracked)
    if (v.stockQty !== null && v.stockQty !== undefined && v.stockQty < qty) {
      throw new Error(`Insufficient stock for ${v.product.name} - ${v.name}`);
    }

    const unitPriceNgn = v.priceNgn;

    // ✅ Pick discount by rule: product-specific > global
    const chosenDiscount = pickDiscountForProduct(discounts, v.productId);

    // Pass the chosenDiscount directly (or null) to avoid unsafe any cast
    const { finalAmount: finalUnitPriceNgn, discountAmount: perUnitDiscountNgn } =
      applyDiscountDetailed(unitPriceNgn, chosenDiscount ?? null);

    const lineSubtotalNgn = unitPriceNgn * qty;
    const lineDiscountNgn = perUnitDiscountNgn * qty;
    const lineTotalNgn = finalUnitPriceNgn * qty;

    const appliedDiscount: AppliedDiscountSummary | null = chosenDiscount
      ? {
          id: chosenDiscount.id,
          title: chosenDiscount.title,
          description: chosenDiscount.description,
          type: chosenDiscount.type,
          percentageOff: chosenDiscount.percentageOff,
          fixedAmountOff: chosenDiscount.fixedAmountOff,
          appliesToAll: chosenDiscount.appliesToAll,
          productIds: chosenDiscount.productIds,
          isActive: chosenDiscount.isActive,
          startsAt: chosenDiscount.startsAt,
          endsAt: chosenDiscount.endsAt,
          createdAt: chosenDiscount.createdAt,
          updatedAt: chosenDiscount.updatedAt,
        }
      : null;

    return {
      productId: v.productId,
      variantId: v.id,

      productName: v.product.name,
      variantName: v.name,

      quantity: qty,

      // Pricing breakdown
      unitPriceNgn,
      finalUnitPriceNgn,
      perUnitDiscountNgn,

      lineSubtotalNgn,
      lineDiscountNgn,
      lineTotalNgn,

      appliedDiscountId: chosenDiscount?.id ?? null,
      appliedDiscount,
    };
  });

  const subtotalNgn = pricedItems.reduce((s, x) => s + x.lineSubtotalNgn, 0);
  const discountTotalNgn = pricedItems.reduce((s, x) => s + x.lineDiscountNgn, 0);
  const itemsTotalNgn = pricedItems.reduce((s, x) => s + x.lineTotalNgn, 0);

  return {
    currency: "NGN",
    items: pricedItems,
    subtotalNgn,
    discountTotalNgn,
    itemsTotalNgn,
  };
}
