import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { ensureInvoice, formatNgn } from "@/lib/invoice/invoiceUtils";

function mustEnv(name: string, val?: string) {
  if (!val) throw new Error(`Missing ${name} in env`);
  return val;
}

export async function sendReceiptEmail(orderId: string, toEmail: string) {
  const host = mustEnv("SMTP_HOST", process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = mustEnv("SMTP_USER", process.env.SMTP_USER);
  const pass = mustEnv("SMTP_PASS", process.env.SMTP_PASS);
  const from = process.env.SMTP_FROM ?? "Manna <no-reply@manna.com>";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { product: true, productVariant: true } },
    },
  });

  if (!order) throw new Error("Order not found");

  // Only send receipts for paid orders (recommended)
  if (order.paymentStatus !== "PAID") {
    throw new Error("Receipt can only be sent for PAID orders");
  }

  const invoice = await ensureInvoice(orderId);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for others
    auth: { user, pass },
  });

  const linesHtml = order.items
    .map((it) => {
      const name = it.product?.name ?? "Product";
      const variant = it.productVariant?.name ? ` (${it.productVariant.name})` : "";
      return `<li>${name}${variant} — Qty ${it.quantity} — ${formatNgn(it.subtotalNgn)}</li>`;
    })
    .join("");

  const subtotal = order.items.reduce((s, it) => s + it.subtotalNgn, 0);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2>Payment Receipt</h2>
      <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Order:</strong> ${order.orderNumber}</p>
      <p><strong>Status:</strong> ${order.paymentStatus}</p>

      <h3>Items</h3>
      <ul>${linesHtml}</ul>

      <h3>Totals</h3>
      <p>Subtotal: ${formatNgn(subtotal)}</p>
      <p>Delivery: ${formatNgn(order.deliveryFeeNgn)}</p>
      <p><strong>Total: ${formatNgn(order.totalAmountNgn)}</strong></p>

      <p style="margin-top: 18px;">Thanks for shopping with Manna 💚</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Manna Receipt — ${order.orderNumber}`,
    html,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      receiptSentAt: new Date(),
      receiptEmailTo: toEmail,
    },
  });

  return { ok: true, sentTo: toEmail };
}
