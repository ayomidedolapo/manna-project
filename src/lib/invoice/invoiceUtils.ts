import { prisma } from "@/lib/prisma";

export function formatNgn(n: number) {
  return `₦${(n ?? 0).toLocaleString("en-NG")}`;
}

export function makeInvoiceNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${y}${m}${day}-${rand}`;
}

/**
 * Ensure invoiceNumber + invoiceIssuedAt exists (idempotent)
 */
export async function ensureInvoice(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceIssuedAt: true,
    },
  });

  if (!order) throw new Error("Order not found");

  if (order.invoiceNumber) {
    return {
      invoiceNumber: order.invoiceNumber,
      invoiceIssuedAt: order.invoiceIssuedAt,
    };
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      invoiceNumber: makeInvoiceNumber(),
      invoiceIssuedAt: new Date(),
    },
    select: {
      invoiceNumber: true,
      invoiceIssuedAt: true,
    },
  });

  return updated;
}
