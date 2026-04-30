// src/lib/invoice/buildInvoicePdf.ts
import PDFDocument from "pdfkit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { ensureInvoice, formatNgn } from "@/lib/invoice/invoiceUtils";

function safe(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export async function buildInvoicePdfBuffer(orderId: string) {
  const invoiceMeta = await ensureInvoice(orderId);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { product: true, productVariant: true } },
    },
  });

  if (!order) throw new Error("Order not found");

  // ✅ Load assets via fs/promises (avoids readFileSync is not a function)
  const fontPath = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
  const logoPath = path.join(process.cwd(), "public", "uploads", "mannalogo.png");

  const [fontBuffer, logoBuffer] = await Promise.all([
    readFile(fontPath),
    readFile(logoPath),
  ]);

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ✅ Use Inter everywhere
  doc.font(fontBuffer);

  const left = doc.page.margins.left; // 50
  const right = doc.page.width - doc.page.margins.right; // 545
  const contentW = right - left;

  // ===== Header (Logo left, meta right) =====
  doc.image(logoBuffer, left, 45, { width: 80 });

  const metaX = right - 220;
  doc.fontSize(9);
  doc.text(`INVOICE NO: ${invoiceMeta.invoiceNumber}`, metaX, 55, {
    width: 220,
    align: "right",
  });
  doc.text(`Order #: ${order.orderNumber}`, metaX, doc.y + 2, {
    width: 220,
    align: "right",
  });
  doc.text(
    `Date: ${new Date(order.invoiceIssuedAt ?? order.createdAt).toLocaleDateString()}`,
    metaX,
    doc.y + 2,
    { width: 220, align: "right" }
  );

  doc.moveDown(3);

  // ===== Bill To =====
  const billY = 120;
  doc.fontSize(10).text("Bill to:", left, billY);

  const name = safe(order.user?.name) || "Customer";
  const phone = safe(order.user?.phone);
  const email = safe(order.user?.email);

  doc.fontSize(9);
  doc.text(name, left, doc.y + 6);
  doc.text(order.deliveryAddress1);
  if (order.deliveryAddress2) doc.text(order.deliveryAddress2);
  doc.text(`${order.city}, ${order.state}`);
  if (email) doc.text(email);
  if (phone) doc.text(phone);

  if (order.deliveryNote) {
    doc.moveDown(0.2);
    doc.fontSize(9).text(`NOTE: ${order.deliveryNote}`);
  }

  // divider
  doc.moveDown(1);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.6);

  // ===== Table =====
  // ✅ These widths fit A4 properly (prevents ugly wrapping)
  const colDescW = 260;
  const colQtyW = 60;
  const colPriceW = 80;
  const colDiscW = 70;
  const colTotalW = contentW - (colDescW + colQtyW + colPriceW + colDiscW);

  const xDesc = left;
  const xQty = xDesc + colDescW;
  const xPrice = xQty + colQtyW;
  const xDisc = xPrice + colPriceW;
  const xTotal = xDisc + colDiscW;

  // Header row
  const headerY = doc.y;
  doc.fontSize(9).text("Description / Product", xDesc, headerY, { width: colDescW });
  doc.text("Quantity", xQty, headerY, { width: colQtyW, align: "right" });
  doc.text("Price", xPrice, headerY, { width: colPriceW, align: "right" });
  doc.text("Discount", xDisc, headerY, { width: colDiscW, align: "right" });
  doc.text("Total", xTotal, headerY, { width: colTotalW, align: "right" });

  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.7);

  let subtotal = 0;

  for (const item of order.items) {
    const label =
      safe(item.product?.name) +
      (item.productVariant?.name ? ` (${item.productVariant.name})` : "");

    const rowY = doc.y;

    doc.fontSize(9).text(label, xDesc, rowY, { width: colDescW });
    doc.text(String(item.quantity), xQty, rowY, { width: colQtyW, align: "right" });
    doc.text(formatNgn(item.unitPriceNgn), xPrice, rowY, { width: colPriceW, align: "right" });
    doc.text("0", xDisc, rowY, { width: colDiscW, align: "right" });
    doc.text(formatNgn(item.subtotalNgn), xTotal, rowY, { width: colTotalW, align: "right" });

    subtotal += item.subtotalNgn;

    doc.moveDown(1.2);

    // new page safety
    if (doc.y > doc.page.height - 180) {
      doc.addPage();
      doc.font(fontBuffer);
    }
  }

  // divider before totals
  doc.moveDown(0.2);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(1);

  // ===== Totals block (right) =====
  const deliveryFee = order.deliveryFeeNgn ?? 0;
  const total = order.totalAmountNgn ?? subtotal + deliveryFee;

  const totalsLabelW = 130;
  const totalsValW = 110;
  const totalsX = right - (totalsLabelW + totalsValW);

  function totalsRow(label: string, value: string, bold = false) {
    const y = doc.y;
    doc.fontSize(bold ? 10 : 9);
    doc.text(label, totalsX, y, { width: totalsLabelW, align: "left" });
    doc.text(value, totalsX + totalsLabelW, y, { width: totalsValW, align: "right" });
    doc.moveDown(1.1);
  }

  totalsRow("Total Amount", formatNgn(subtotal));
  totalsRow("Discount", "0");
  totalsRow("Total", formatNgn(total), true);

  // ===== Footer =====
  doc.fontSize(9).text("Thank you for shopping with Manna", left, doc.page.height - 90);

  doc.end();
  const pdf = await done;

  return {
    pdf,
    invoiceNumber: invoiceMeta.invoiceNumber,
    orderNumber: order.orderNumber,
  };
}
