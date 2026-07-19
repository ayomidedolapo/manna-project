import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { isJsonObject } from "@/lib/marketplace/json";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

type ProductForCart = {
  id: string;
  marketClusterId: string | null;
};

type CartForCluster = {
  id: string;
  marketClusterId: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const body: unknown = await req.json().catch(() => null);

    if (!isJsonObject(body)) {
      return NextResponse.json(
        { message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const productId = typeof body.productId === "string" ? body.productId : null;
    const productVariantId =
      typeof body.productVariantId === "string" ? body.productVariantId : null;
    const quantity = Number(body.quantity ?? 1);

    if (!productId) {
      return NextResponse.json(
        { message: "productId is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { message: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    const product = (await prisma.product.findFirst({
      where: {
        id: productId,
        isActive: true,
        approvalStatus: "APPROVED",
        OR: [
          { vendorId: null },
          { vendor: { status: "APPROVED", isActive: true, isVisible: true } },
        ],
      },
      select: {
        id: true,
        marketClusterId: true,
      },
    })) as ProductForCart | null;

    if (!product) {
      return NextResponse.json(
        { message: "Product not found or not available" },
        { status: 404 }
      );
    }

    if (productVariantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: productVariantId, productId },
        select: { id: true, stockQty: true },
      });

      if (!variant) {
        return NextResponse.json(
          { message: "Variant not found for this product" },
          { status: 404 }
        );
      }

      if (
        variant.stockQty !== null &&
        variant.stockQty !== undefined &&
        quantity > variant.stockQty
      ) {
        return NextResponse.json(
          { message: "Not enough stock for this variant" },
          { status: 400 }
        );
      }
    }

    const cart = (await prisma.cart.upsert({
      where: { userId: decoded.userId },
      create: {
        userId: decoded.userId,
        marketClusterId: product.marketClusterId,
      } as never,
      update: {},
      select: {
        id: true,
        marketClusterId: true,
      },
    })) as CartForCluster;

    if (
      product.marketClusterId &&
      cart.marketClusterId &&
      cart.marketClusterId !== product.marketClusterId
    ) {
      return NextResponse.json(
        {
          message:
            "Your cart already contains items from another market cluster. Clear your cart before shopping from this cluster.",
        },
        { status: 409 }
      );
    }

    if (product.marketClusterId && !cart.marketClusterId) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { marketClusterId: product.marketClusterId } as never,
      });
    }

    const existing = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        ...(productVariantId
          ? { productVariantId }
          : { productVariantId: null }),
      },
      select: { id: true, quantity: true },
    });

    const item = existing
      ? await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                marketClusterId: true,
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
            updatedAt: true,
            createdAt: true,
          },
        })
      : await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            productVariantId,
            quantity,
          },
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                marketClusterId: true,
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
            updatedAt: true,
            createdAt: true,
          },
        });

    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error: unknown) {
    console.error("CART_ADD_ITEM_ERROR", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
}
