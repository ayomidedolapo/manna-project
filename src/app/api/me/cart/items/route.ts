import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const body = await req.json().catch(() => null);
    const productId = body?.productId as string | undefined;
    const productVariantId = (body?.productVariantId as string | null | undefined) ?? null;
    const quantityRaw = body?.quantity;

    const quantity = Number(quantityRaw ?? 1);

    if (!productId) {
      return NextResponse.json({ message: "productId is required" }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ message: "quantity must be a positive number" }, { status: 400 });
    }

    // Ensure product exists + active
    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    // If variant provided, validate it belongs to product + stock
    if (productVariantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: productVariantId, productId },
        select: { id: true, stockQty: true },
      });

      if (!variant) {
        return NextResponse.json({ message: "Variant not found for this product" }, { status: 404 });
      }

      // Optional stock check (recommended)
      if (variant.stockQty !== null && variant.stockQty !== undefined && quantity > variant.stockQty) {
        return NextResponse.json(
          { message: "Not enough stock for this variant" },
          { status: 400 }
        );
      }
    }

    // Ensure cart exists
    const cart = await prisma.cart.upsert({
      where: { userId: decoded.userId },
      create: { userId: decoded.userId },
      update: {},
      select: { id: true },
    });

    // Because Postgres UNIQUE with nullable variantId can allow duplicates when variantId is null,
    // we handle "variantId null" and "variantId not null" separately.

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

    let item;
    if (existing) {
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
        select: {
          id: true,
          quantity: true,
          product: { select: { id: true, name: true, slug: true, imageUrl: true } },
          productVariant: { select: { id: true, name: true, unit: true, unitWeightKg: true, priceNgn: true, stockQty: true } },
          updatedAt: true,
          createdAt: true,
        },
      });
    } else {
      item = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          productVariantId,
          quantity,
        },
        select: {
          id: true,
          quantity: true,
          product: { select: { id: true, name: true, slug: true, imageUrl: true } },
          productVariant: { select: { id: true, name: true, unit: true, unitWeightKg: true, priceNgn: true, stockQty: true } },
          updatedAt: true,
          createdAt: true,
        },
      });
    }

    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    console.error("CART_ADD_ITEM_ERROR", error);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
