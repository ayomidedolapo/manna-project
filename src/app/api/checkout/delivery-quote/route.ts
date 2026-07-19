import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { isJsonObject, optionalString, requiredString, optionalNumber } from "@/lib/marketplace/json";
import { quoteKwikMarketplaceDelivery } from "@/lib/kwik/quoteService";
import type { VendorPickupInput } from "@/lib/kwik/payloadBuilder";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

type DeliveryQuoteBody = {
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryName: string;
  deliveryPhone: string;
  deliveryEmail?: string;
  deliveryInstruction?: string;
  vehicleId?: number;
  vehicleName?: string;
};

type PickupLocationForQuote = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  contactName: string | null;
  phone: string | null;
};

type CartForQuote = {
  id: string;
  marketClusterId: string | null;
  marketCluster: {
    id: string;
    name: string;
    slug: string;
  } | null;
  items: Array<{
    quantity: number;
    product: {
      id: string;
      name: string;
      marketClusterId: string | null;
      vendor: {
        id: string;
        displayName: string;
        email: string | null;
        phone: string | null;
        pickupLocations: PickupLocationForQuote[];
      } | null;
    };
    productVariant: {
      id: string;
      name: string;
      unitWeightKg: number | null;
      priceNgn: number;
    } | null;
  }>;
};

function parseBody(value: unknown): DeliveryQuoteBody | null {
  if (!isJsonObject(value)) return null;

  const deliveryAddress = requiredString(value.deliveryAddress);
  const deliveryName = requiredString(value.deliveryName);
  const deliveryPhone = requiredString(value.deliveryPhone);
  const deliveryLat = optionalNumber(value.deliveryLat);
  const deliveryLng = optionalNumber(value.deliveryLng);

  if (!deliveryAddress || !deliveryName || !deliveryPhone || deliveryLat === null || deliveryLng === null) {
    return null;
  }

  return {
    deliveryAddress,
    deliveryName,
    deliveryPhone,
    deliveryLat,
    deliveryLng,
    deliveryEmail: optionalString(value.deliveryEmail) ?? undefined,
    deliveryInstruction: optionalString(value.deliveryInstruction) ?? undefined,
    vehicleId: optionalNumber(value.vehicleId) ?? undefined,
    vehicleName: optionalString(value.vehicleName) ?? undefined,
  };
}

function buildPickups(cart: CartForQuote): VendorPickupInput[] {
  const pickups = new Map<string, VendorPickupInput>();

  for (const item of cart.items) {
    const vendor = item.product.vendor;

    if (!vendor) {
      throw new Error(`Product ${item.product.name} is not attached to an approved vendor`);
    }

    const pickupLocation = vendor.pickupLocations[0];

    if (!pickupLocation) {
      throw new Error(`${vendor.displayName} does not have an active pickup location`);
    }

    if (!pickups.has(vendor.id)) {
      pickups.set(vendor.id, {
        vendorId: vendor.id,
        vendorName: vendor.displayName,
        address: pickupLocation.address,
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        phone: pickupLocation.phone ?? vendor.phone ?? "+2340000000000",
        email: vendor.email ?? undefined,
      });
    }
  }

  return Array.from(pickups.values());
}

function calculateParcelAmount(cart: CartForQuote): number {
  return cart.items.reduce((total, item) => {
    const unitPrice = item.productVariant?.priceNgn ?? 0;
    return total + unitPrice * item.quantity;
  }, 0);
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const parsedBody = parseBody(await req.json());

    if (!parsedBody) {
      return NextResponse.json(
        {
          message:
            "deliveryAddress, deliveryLat, deliveryLng, deliveryName and deliveryPhone are required",
        },
        { status: 400 }
      );
    }

    const cart = (await prisma.cart.findUnique({
      where: { userId: decoded.userId },
      select: {
        id: true,
        marketClusterId: true,
        marketCluster: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        items: {
          select: {
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                marketClusterId: true,
                vendor: {
                  select: {
                    id: true,
                    displayName: true,
                    email: true,
                    phone: true,
                    pickupLocations: {
                      where: { isActive: true },
                      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                      take: 1,
                      select: {
                        id: true,
                        address: true,
                        latitude: true,
                        longitude: true,
                        contactName: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
            productVariant: {
              select: {
                id: true,
                name: true,
                unitWeightKg: true,
                priceNgn: true,
              },
            },
          },
        },
      },
    })) as CartForQuote | null;

    if (!cart || cart.items.length === 0) {
      return NextResponse.json({ message: "Cart is empty" }, { status: 400 });
    }

    if (!cart.marketClusterId || !cart.marketCluster) {
      return NextResponse.json(
        { message: "Cart must be locked to one market cluster before delivery quote" },
        { status: 400 }
      );
    }

    const invalidClusterItem = cart.items.find(
      (item) => item.product.marketClusterId !== cart.marketClusterId
    );

    if (invalidClusterItem) {
      return NextResponse.json(
        { message: "Cart contains an item outside the selected market cluster" },
        { status: 409 }
      );
    }

    const pickups = buildPickups(cart);

    const quote = await quoteKwikMarketplaceDelivery({
      pickups,
      delivery: {
        name: parsedBody.deliveryName,
        phone: parsedBody.deliveryPhone,
        email: parsedBody.deliveryEmail,
        address: parsedBody.deliveryAddress,
        latitude: parsedBody.deliveryLat,
        longitude: parsedBody.deliveryLng,
        instruction: parsedBody.deliveryInstruction,
      },
      vehicleId: parsedBody.vehicleId,
      vehicleName: parsedBody.vehicleName,
      parcelAmountNgn: calculateParcelAmount(cart),
    });

    const quoteExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const deliveryQuote = await prisma.deliveryQuote.create({
      data: {
        userId: decoded.userId,
        cartId: cart.id,
        marketClusterId: cart.marketClusterId,
        pickupCount: quote.pickupCount,
        deliveryCount: quote.deliveryCount,
        currency: "NGN",
        kwikPerTaskCostNgn: quote.kwikPerTaskCostNgn,
        kwikTotalServiceChargeNgn: quote.kwikTotalServiceChargeNgn,
        kwikPayableAmountNgn: quote.kwikPayableAmountNgn,
        kwikNetPayableAmountNgn: quote.kwikNetPayableAmountNgn,
        kwikDeliveryChargeNgn: quote.kwikDeliveryChargeNgn,
        kwikSurgeCostNgn: quote.kwikSurgeCostNgn,
        kwikSurgeType: quote.kwikSurgeType,
        kwikVehicleId: quote.kwikVehicleId,
        kwikVehicleName: quote.kwikVehicleName,
        amountToChargeCustomerNgn: quote.amountToChargeCustomerNgn,
        rawQuoteRequest: quote.quotePayload,
        rawQuoteResponse: quote.quoteResponse,
        rawBillRequest: quote.billPayload,
        rawBillResponse: quote.billResponse,
        quoteExpiresAt,
        status: "QUOTED",
      } as never,
      select: {
        id: true,
        pickupCount: true,
        deliveryCount: true,
        amountToChargeCustomerNgn: true,
        currency: true,
        quoteExpiresAt: true,
        kwikVehicleId: true,
        kwikVehicleName: true,
        marketClusterId: true,
      },
    });

    return NextResponse.json(
      {
        message: "Delivery quote created",
        quote: deliveryQuote,
        marketCluster: cart.marketCluster,
        pickupVendors: pickups.map((pickup) => ({
          vendorId: pickup.vendorId,
          vendorName: pickup.vendorName,
          address: pickup.address,
        })),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("KWIK_DELIVERY_QUOTE_ERROR", error);

    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ message }, { status: 500 });
  }
}
