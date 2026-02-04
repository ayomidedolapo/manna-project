import { prisma } from "@/lib/prisma";

type CartItemInput = { variantId: string; quantity: number };

type Discount = {
  id: string;
  type: "PERCENTAGE" | "FIXED";
  percentageOff?: number | null;
  fixedAmountOff?: number | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  appliesToAll?: boolean | null;
  productIds?: string[] | null;
};

function isDiscountActive(d: Discount) {
  if (!d.isActive) return false;
  const now = new Date();
  if (d.startsAt && now < d.startsAt) return false;
  if (d.endsAt && now > d.endsAt) return false;
  return true;
}

function applyDiscount(unitPrice: number, discount: Discount | null) {
  if (!discount) return { finalUnitPrice: unitPrice, perUnitDiscount: 0 };

  if (discount.type === "PERCENTAGE") {
    const pct = Math.max(0, Math.min(100, discount.percentageOff ?? 0));
    const off = Math.floor((unitPrice * pct) / 100);
    return { finalUnitPrice: Math.max(0, unitPrice - off), perUnitDiscount: off };
  }

  if (discount.type === "FIXED") {
    const off = Math.max(0, discount.fixedAmountOff ?? 0);
    return { finalUnitPrice: Math.max(0, unitPrice - off), perUnitDiscount: Math.min(unitPrice, off) };
  }

  return { finalUnitPrice: unitPrice, perUnitDiscount: 0 };
}

function pickBestDiscount(unitPrice: number, discounts: Discount[]) {
  // pick the discount that yields the lowest final price
  let best: Discount | null = null;
  let bestFinal = unitPrice;

  for (const d of discounts) {
    const { finalUnitPrice } = applyDiscount(unitPrice, d);
    if (finalUnitPrice < bestFinal) {
      bestFinal = finalUnitPrice;
      best = d;
    }
  }

  return best;
}

export async function priceCart(items: CartItemInput[]) {
  if (!items.length) throw new Error("Cart is empty");

  const variantIds = items.map(i => i.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  if (variants.length !== variantIds.length) {
    throw new Error("One or more variants not found");
  }

  // Fetch active discounts and normalize productIds from JSON to string[] | null
  const allDiscountsRaw = await prisma.discount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const allDiscounts: Discount[] = allDiscountsRaw.map((d) => {
    let productIds: string[] | null = null;
    if (Array.isArray(d.productIds)) {
      productIds = d.productIds as string[];
    } else if (typeof d.productIds === "string") {
      productIds = [d.productIds];
    } else {
      productIds = null;
    }

    return {
      id: d.id,
      type: d.type as "PERCENTAGE" | "FIXED",
      percentageOff: d.percentageOff ?? null,
      fixedAmountOff: d.fixedAmountOff ?? null,
      isActive: d.isActive,
      startsAt: d.startsAt ?? null,
      endsAt: d.endsAt ?? null,
      appliesToAll: d.appliesToAll ?? null,
      productIds,
    };
  });

  const activeDiscounts = allDiscounts.filter(isDiscountActive);

  const pricedItems = items.map((ci) => {
    const v = variants.find((x: typeof variants[number]) => x.id === ci.variantId)!;

    const qty = ci.quantity;
    if (!Number.isInteger(qty) || qty < 1) throw new Error("Invalid quantity");

    // Stock check here too (we’ll also re-check in transaction)
    if (v.stockQty !== null && v.stockQty !== undefined && v.stockQty < qty) {
      throw new Error(`Insufficient stock for ${v.product.name} - ${v.name}`);
    }

    const unitPrice = v.priceNgn;

    // Discounts that apply to this product
    const applicable = activeDiscounts.filter((d: Discount) => {
      if (d.appliesToAll) return true;
      const ids = Array.isArray(d.productIds) ? d.productIds : [];
      return ids.includes(v.productId);
    });

    const best = pickBestDiscount(unitPrice, applicable);
    const { finalUnitPrice, perUnitDiscount } = applyDiscount(unitPrice, best);

    const lineSubtotal = unitPrice * qty;
    const lineDiscount = perUnitDiscount * qty;
    const lineTotal = finalUnitPrice * qty;

    return {
      productId: v.productId,
      variantId: v.id,
      productName: v.product.name,
      variantName: v.name,
      unitPrice,
      finalUnitPrice,
      perUnitDiscount,
      quantity: qty,
      lineSubtotal,
      lineDiscount,
      lineTotal,
      appliedDiscountId: best?.id ?? null,
    };
  });

  const subtotal = pricedItems.reduce((s, x) => s + x.lineSubtotal, 0);
  const discountTotal = pricedItems.reduce((s, x) => s + x.lineDiscount, 0);
  const itemsTotal = pricedItems.reduce((s, x) => s + x.lineTotal, 0);

  return {
    currency: "NGN",
    items: pricedItems,
    subtotal,
    discountTotal,
    itemsTotal,
  };
}
