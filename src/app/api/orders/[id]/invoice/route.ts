import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInvoice } from "@/lib/invoice/invoiceUtils";
import { requireOrderAccess } from "@/lib/auth/requireOrderAccess";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const access = await requireOrderAccess(id);
    if (!access.ok) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
    }

    const invoiceMeta = await ensureInvoice(id);

    const full = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            productVariant: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });

    if (!full) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    const items = full.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product?.name ?? "Product",
      variantId: it.productVariantId,
      variantName: it.productVariant?.name ?? null,
      quantity: it.quantity,
      unitPriceNgn: it.unitPriceNgn,
      subtotalNgn: it.subtotalNgn,
    }));

    const subtotalNgn = items.reduce((s, x) => s + x.subtotalNgn, 0);

    return NextResponse.json({
      ok: true,
      invoice: {
        invoiceNumber: invoiceMeta.invoiceNumber,
        invoiceIssuedAt: invoiceMeta.invoiceIssuedAt,
      },
      customer: full.user
        ? {
            id: full.user.id,
            name: full.user.name,
            phone: full.user.phone,
            email: full.user.email,
          }
        : null,
      order: {
        id: full.id,
        orderNumber: full.orderNumber,
        status: full.status,
        paymentStatus: full.paymentStatus,
        createdAt: full.createdAt,
        paidAt: full.paidAt,
      },
      delivery: {
        address1: full.deliveryAddress1,
        address2: full.deliveryAddress2,
        city: full.city,
        state: full.state,
        note: full.deliveryNote,
        feeNgn: full.deliveryFeeNgn,
      },
      totals: {
        subtotalNgn,
        deliveryFeeNgn: full.deliveryFeeNgn,
        totalAmountNgn: full.totalAmountNgn,
      },
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
