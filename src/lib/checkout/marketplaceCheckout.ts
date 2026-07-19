import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";
import { priceCart } from "@/lib/checkout/priceCart";

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

export type CheckoutItemInput = {
  variantId: string;
  quantity: number;
};

export type MarketplaceCheckoutInput = {
  userId: string;
  deliveryQuoteId: string;
  items: CheckoutItemInput[];
  deliveryAddress1: string;
  deliveryAddress2?: string;
  city: string;
  state: string;
  deliveryNote?: string;
  deliveryLat: number;
  deliveryLng: number;
};

type DeliveryQuoteForCheckout = {
  id: string;
  userId: string | null;
  cartId: string | null;
  orderId: string | null;
  marketClusterId: string;
  status: string;
  quoteExpiresAt: Date;
  amountToChargeCustomerNgn: number;
  pickupCount: number;
  deliveryCount: number;
  kwikVehicleId: number | null;
  kwikVehicleName: string | null;
  rawQuoteRequest: unknown;
  rawBillResponse: unknown;
};

type CartItemForCheckout = {
  quantity: number;
  productVariantId: string | null;
  product: {
    id: string;
    name: string;
    marketClusterId: string | null;
  };
  productVariant: {
    id: string;
    name: string;
    stockQty: number | null;
  } | null;
};

type CartForCheckout = {
  id: string;
  marketClusterId: string | null;
  items: CartItemForCheckout[];
};

function makeOrderNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `MAN-${y}${m}${day}-${nanoid()}`;
}

function itemKey(item: CheckoutItemInput) {
  return `${item.variantId}:${item.quantity}`;
}

function normalizeItems(items: CheckoutItemInput[]) {
  return [...items].map(itemKey).sort().join("|");
}

function assertValidCheckoutItems(items: CheckoutItemInput[]) {
  if (items.length === 0) throw new Error("Cart is empty");

  for (const item of items) {
    if (!item.variantId) throw new Error("variantId is required for every checkout item");
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Invalid checkout item quantity");
    }
  }
}

function buildCartItemsForPricing(cart: CartForCheckout): CheckoutItemInput[] {
  return cart.items.map((item) => {
    if (!item.productVariantId || !item.productVariant) {
      throw new Error(
        `Product ${item.product.name} must have a variant before checkout can continue`
      );
    }

    return {
      variantId: item.productVariantId,
      quantity: item.quantity,
    };
  });
}

function assertBodyMatchesCart(bodyItems: CheckoutItemInput[], cartItems: CheckoutItemInput[]) {
  if (normalizeItems(bodyItems) !== normalizeItems(cartItems)) {
    throw new Error("Cart changed after delivery quote. Refresh cart and request a new quote.");
  }
}

function assertQuoteIsUsable(quote: DeliveryQuoteForCheckout, userId: string, cart: CartForCheckout) {
  if (quote.userId !== userId) {
    throw new Error("Delivery quote does not belong to this customer");
  }

  if (quote.cartId !== cart.id) {
    throw new Error("Delivery quote does not belong to the current cart");
  }

  if (quote.orderId) {
    throw new Error("Delivery quote has already been used");
  }

  if (quote.status !== "QUOTED") {
    throw new Error("Delivery quote is not active");
  }

  if (quote.quoteExpiresAt.getTime() <= Date.now()) {
    throw new Error("Delivery quote has expired. Request a new quote.");
  }

  if (!cart.marketClusterId) {
    throw new Error("Cart must belong to one market cluster before checkout");
  }

  if (cart.marketClusterId !== quote.marketClusterId) {
    throw new Error("Delivery quote does not match the cart market cluster");
  }

  const outsideCluster = cart.items.find(
    (item) => item.product.marketClusterId !== cart.marketClusterId
  );

  if (outsideCluster) {
    throw new Error("Cart contains an item outside the selected market cluster");
  }
}

function buildQuoteSnapshot(quote: DeliveryQuoteForCheckout) {
  return {
    deliveryQuoteId: quote.id,
    amountToChargeCustomerNgn: quote.amountToChargeCustomerNgn,
    pickupCount: quote.pickupCount,
    deliveryCount: quote.deliveryCount,
    marketClusterId: quote.marketClusterId,
    kwikVehicleId: quote.kwikVehicleId,
    kwikVehicleName: quote.kwikVehicleName,
    quoteExpiresAt: quote.quoteExpiresAt.toISOString(),
  };
}

export async function createMarketplacePendingOrderFromQuote(input: MarketplaceCheckoutInput) {
  assertValidCheckoutItems(input.items);

  if (!Number.isFinite(input.deliveryLat) || !Number.isFinite(input.deliveryLng)) {
    throw new Error("deliveryLat and deliveryLng must be valid numbers");
  }

  const [quote, cart] = await Promise.all([
    prisma.deliveryQuote.findUnique({
      where: { id: input.deliveryQuoteId },
      select: {
        id: true,
        userId: true,
        cartId: true,
        orderId: true,
        marketClusterId: true,
        status: true,
        quoteExpiresAt: true,
        amountToChargeCustomerNgn: true,
        pickupCount: true,
        deliveryCount: true,
        kwikVehicleId: true,
        kwikVehicleName: true,
        rawQuoteRequest: true,
        rawBillResponse: true,
      },
    }) as Promise<DeliveryQuoteForCheckout | null>,
    prisma.cart.findUnique({
      where: { userId: input.userId },
      select: {
        id: true,
        marketClusterId: true,
        items: {
          select: {
            quantity: true,
            productVariantId: true,
            product: {
              select: {
                id: true,
                name: true,
                marketClusterId: true,
              },
            },
            productVariant: {
              select: {
                id: true,
                name: true,
                stockQty: true,
              },
            },
          },
        },
      },
    }) as Promise<CartForCheckout | null>,
  ]);

  if (!quote) throw new Error("Delivery quote not found");
  if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

  assertQuoteIsUsable(quote, input.userId, cart);

  const cartItems = buildCartItemsForPricing(cart);
  assertBodyMatchesCart(input.items, cartItems);

  const pricing = await priceCart(cartItems);
  const deliveryFeeNgn = quote.amountToChargeCustomerNgn;
  const totalAmountNgn = pricing.itemsTotalNgn + deliveryFeeNgn;

  const order = await prisma.$transaction(async (tx) => {
    const variants = await tx.productVariant.findMany({
      where: { id: { in: cartItems.map((item) => item.variantId) } },
      include: { product: true },
    });

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

    for (const checkoutItem of cartItems) {
      const variant = variantMap.get(checkoutItem.variantId);
      if (!variant) throw new Error("Variant not found");

      if (variant.stockQty !== null && variant.stockQty !== undefined) {
        if (variant.stockQty < checkoutItem.quantity) {
          throw new Error(
            `Insufficient stock for ${variant.product.name} - ${variant.name}`
          );
        }
      }
    }

    const created = await tx.order.create({
      data: {
        orderNumber: makeOrderNumber(),
        userId: input.userId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        totalAmountNgn,
        deliveryFeeNgn,
        deliveryAddress1: input.deliveryAddress1,
        deliveryAddress2: input.deliveryAddress2 ?? null,
        city: input.city,
        state: input.state,
        deliveryNote: input.deliveryNote ?? null,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
        deliveryPartner: "KWIK",
        marketClusterId: quote.marketClusterId,
        deliveryQuoteId: quote.id,
        deliveryQuoteSnapshot: buildQuoteSnapshot(quote),
        deliveryQuoteExpiresAt: quote.quoteExpiresAt,
        deliveryPickupCount: quote.pickupCount,
        items: {
          create: pricing.items.map((item) => ({
            productId: item.productId,
            productVariantId: item.variantId,
            quantity: item.quantity,
            unitPriceNgn: item.finalUnitPriceNgn,
            subtotalNgn: item.lineTotalNgn,
          })),
        },
      } as never,
      include: { items: true },
    });

    const quoteUpdate = await tx.deliveryQuote.updateMany({
      where: {
        id: quote.id,
        userId: input.userId,
        cartId: cart.id,
        orderId: null,
        status: "QUOTED",
        quoteExpiresAt: { gt: new Date() },
      },
      data: {
        orderId: created.id,
        status: "USED",
      } as never,
    });

    if (quoteUpdate.count !== 1) {
      throw new Error("Delivery quote is no longer available. Request a new quote.");
    }

    return created;
  });

  return {
    order,
    pricing,
    deliveryQuote: {
      id: quote.id,
      amountToChargeCustomerNgn: deliveryFeeNgn,
      pickupCount: quote.pickupCount,
      quoteExpiresAt: quote.quoteExpiresAt,
    },
    totals: {
      subtotalNgn: pricing.subtotalNgn,
      discountTotalNgn: pricing.discountTotalNgn,
      itemsTotalNgn: pricing.itemsTotalNgn,
      deliveryFeeNgn,
      totalAmountNgn,
    },
  };
}
