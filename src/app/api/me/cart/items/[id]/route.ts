import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";

function unauthorized() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

// =========================
// PATCH → update quantity
// =========================
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const body = await req.json().catch(() => null);
    const quantity = Number(body?.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ message: "quantity must be a positive number" }, { status: 400 });
    }

    const cart = await prisma.cart.findUnique({
      where: { userId: decoded.userId },
      select: { id: true },
    });

    if (!cart) {
      return NextResponse.json({ message: "Cart not found" }, { status: 404 });
    }

    const item = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      select: { id: true, productVariantId: true },
    });

    if (!item) {
      return NextResponse.json({ message: "Cart item not found" }, { status: 404 });
    }

    // stock check
    if (item.productVariantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.productVariantId },
        select: { stockQty: true },
      });

      if (
        variant?.stockQty !== null &&
        variant?.stockQty !== undefined &&
        quantity > variant.stockQty
      ) {
        return NextResponse.json({ message: "Not enough stock" }, { status: 400 });
      }
    }

    const updated = await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });

    return NextResponse.json({ ok: true, item: updated }, { status: 200 });
  } catch (error) {
    console.error("CART_UPDATE_ITEM_ERROR", error);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

// =========================
// DELETE → remove item
// =========================
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    if (!token) return unauthorized();

    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) return unauthorized();

    const cart = await prisma.cart.findUnique({
      where: { userId: decoded.userId },
      select: { id: true },
    });

    if (!cart) {
      return NextResponse.json({ message: "Cart not found" }, { status: 404 });
    }

    const item = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      select: { id: true },
    });

    if (!item) {
      return NextResponse.json({ message: "Cart item not found" }, { status: 404 });
    }

    await prisma.cartItem.delete({ where: { id: item.id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("CART_DELETE_ITEM_ERROR", error);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
