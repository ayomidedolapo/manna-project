// src/lib/invoice/buildInvoicePdfStyled.ts
//
// ✅ Fixes:
// - Table "Total" column now has enough width (no more vertical wrapping)
// - Total header/value forced to render on ONE LINE using textNoWrap()
// - Keeps: 1.5x-ish spacing, bigger logo, bold/lights, footer up

import PDFDocument from "pdfkit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { ensureInvoice, formatNgn } from "@/lib/invoice/invoiceUtils";

function safe(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

async function readOptional(filePath: string) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function n(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function buildInvoicePdfStyled(orderId: string) {
  const invoiceMeta = await ensureInvoice(orderId);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { product: true, productVariant: true } },
    },
  });

  if (!order) throw new Error("Order not found");

  // ===== Assets =====
  const fontRegularPath = path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
  const fontBoldPath = path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf");
  const fontLightPath = path.join(process.cwd(), "public", "fonts", "Inter-Light.ttf"); // optional
  const logoPath = path.join(process.cwd(), "public", "uploads", "mannalogo.png");

  const [fontRegular, fontBold, fontLightMaybe, logoBuffer] = await Promise.all([
    readFile(fontRegularPath),
    readFile(fontBoldPath),
    readOptional(fontLightPath),
    readFile(logoPath),
  ]);

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    compress: true,
  });

  // ✅ 1.5x-ish spacing globally
  doc.lineGap(4);
  const baseLineH = 14;

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ===== Fonts helpers =====
  const regular = () => doc.font(fontRegular);
  const bold = () => doc.font(fontBold);
  const light = () => (fontLightMaybe ? doc.font(fontLightMaybe) : doc.font(fontRegular));

  // ===== Layout constants =====
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;
  const pageW = right - left;

  const line = "#D9D9D9";
  const dark = "#111111";
  const mid = "#444444";

  regular();
  doc.fillColor(dark);

  // ---- helper: draw a single line, never wrap ----
  function textNoWrap(
    text: string,
    x: number,
    y: number,
    boxWidth: number,
    align: "left" | "right"
  ) {
    const originalSize = (doc as any)._fontSize as number;
    const w = doc.widthOfString(text);

    // Safety shrink if it ever exceeds box width
    if (w > boxWidth) {
      const scale = boxWidth / w;
      doc.fontSize(Math.max(7.5, originalSize * scale));
    }

    const finalW = doc.widthOfString(text);
    const drawX = align === "right" ? x + boxWidth - finalW : x;

    doc.text(text, drawX, y, { lineBreak: false });

    // restore
    if ((doc as any)._fontSize !== originalSize) doc.fontSize(originalSize);
  }

  // =========================
  // Header (Logo left, Meta right)
  // =========================
  const logoW = 135;
  doc.image(logoBuffer, left, top - 18, { width: logoW });

  const metaW = 300;
  const metaX = right - metaW;

  const issuedDate = new Date(order.invoiceIssuedAt ?? order.createdAt);

  bold();
  doc.fontSize(9.6).fillColor(dark);
  doc.text(`INVOICE NO: ${invoiceMeta.invoiceNumber}`, metaX, top - 2, {
    width: metaW,
    align: "right",
    lineBreak: false,
  });

  bold();
  doc.fontSize(9.6).fillColor(dark);
  doc.text(`Order #: ${order.orderNumber}`, metaX, doc.y + 2, {
    width: metaW,
    align: "right",
    lineBreak: false,
  });

  light();
  doc.fontSize(9.2).fillColor(mid);
  doc.text(
    `Date: ${issuedDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`,
    metaX,
    doc.y + 2,
    { width: metaW, align: "right", lineBreak: false }
  );

  doc.y = top + 95;

  // =========================
  // Bill To block
  // =========================
  bold();
  doc.fontSize(9).fillColor(dark).text("Bill to:", left, doc.y, { lineGap: 4 });

  const billY = doc.y + baseLineH;

  const customerName = safe(order.user?.name) || "Customer";
  const customerPhone = safe(order.user?.phone);
  const customerEmail = safe(order.user?.email);

  bold();
  doc.fontSize(9).fillColor(dark).text(customerName, left, billY, { lineGap: 4 });

  regular();
  doc.fontSize(9).fillColor(dark);

  if (safe(order.deliveryAddress1)) doc.text(safe(order.deliveryAddress1), left, doc.y + 2);
  if (safe(order.deliveryAddress2)) doc.text(safe(order.deliveryAddress2), left, doc.y + 2);
  doc.text(`${safe(order.city)}, ${safe(order.state)}`, left, doc.y + 2);
  if (customerEmail) doc.text(customerEmail, left, doc.y + 2);
  if (customerPhone) doc.text(customerPhone, left, doc.y + 2);

  if (safe(order.deliveryNote)) {
    doc.moveDown(0.25);
    bold();
    doc.fontSize(9).fillColor(dark);
    doc.text("NOTE:", left, doc.y + 2, { continued: true, lineBreak: false });
    doc.text(` ${safe(order.deliveryNote)}`, { lineBreak: false });
  }

  // Divider
  doc.moveDown(1.6);
  doc.save();
  doc.strokeColor(line).lineWidth(1);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.restore();

  doc.moveDown(0.9);

  // =========================
  // Items Table  ✅ FIXED WIDTHS (Total column now wide)
  // =========================
  // A4 content width ~495. MUST give Total column enough room.
  // New widths: desc 205, qty 60, price 80, discount 70, total 80 = 495
  const colDescW = 205;
  const colQtyW = 60;
  const colPriceW = 80;
  const colDiscW = 70;
  const colTotalW = pageW - (colDescW + colQtyW + colPriceW + colDiscW); // ~80

  const xDesc = left;
  const xQty = xDesc + colDescW;
  const xPrice = xQty + colQtyW;
  const xDisc = xPrice + colPriceW;
  const xTotal = xDisc + colDiscW;

  const headerY = doc.y;
  bold();
  doc.fontSize(8.7).fillColor(dark);

  doc.text("Description / Product", xDesc, headerY, { width: colDescW, lineBreak: false });
  doc.text("Quantity", xQty, headerY, { width: colQtyW, align: "right", lineBreak: false });
  doc.text("Price", xPrice, headerY, { width: colPriceW, align: "right", lineBreak: false });
  doc.text("Discount", xDisc, headerY, { width: colDiscW, align: "right", lineBreak: false });

  // ✅ Total header forced to never wrap
  textNoWrap("Total", xTotal, headerY, colTotalW, "right");

  doc.moveDown(0.75);
  doc.save();
  doc.strokeColor(line).lineWidth(1);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.restore();
  doc.moveDown(0.45);

  regular();
  doc.fontSize(9).fillColor(dark);

  let subtotal = 0;

  for (const it of order.items) {
    const p = safe(it.product?.name) || "Item";
    const v = safe(it.productVariant?.name);
    const label = v ? `${p} (${v})` : p;

    const qty = n(it.quantity);
    const unit = n(it.unitPriceNgn);
    const rowTotal = n(it.subtotalNgn) || qty * unit;

    const rowY = doc.y;

    doc.text(label, xDesc, rowY, { width: colDescW });
    doc.text(String(qty), xQty, rowY, { width: colQtyW, align: "right", lineBreak: false });
    doc.text(formatNgn(unit), xPrice, rowY, { width: colPriceW, align: "right", lineBreak: false });
    doc.text("0", xDisc, rowY, { width: colDiscW, align: "right", lineBreak: false });

    // ✅ Total value forced to never wrap (fixes ₦ 7 0 0 0 stacking)
    textNoWrap(formatNgn(rowTotal), xTotal, rowY, colTotalW, "right");

    subtotal += rowTotal;

    doc.moveDown(1.15);

    doc.save();
    doc.strokeColor(line).lineWidth(0.9);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.restore();

    doc.moveDown(0.4);

    if (doc.y > doc.page.height - 260) {
      doc.addPage();
      regular();
      doc.fontSize(9).fillColor(dark);
    }
  }

  // =========================
  // Totals block (already fixed)
  // =========================
  doc.moveDown(1.2);

  const deliveryFee = n(order.deliveryFeeNgn);
  const total = n(order.totalAmountNgn) || subtotal + deliveryFee;

  const totalsW = 360;
  const totalsX = right - totalsW;

  doc.save();
  doc.strokeColor(line).lineWidth(1);
  doc.moveTo(totalsX, doc.y).lineTo(right, doc.y).stroke();
  doc.restore();

  doc.moveDown(0.8);

  const labelW = 220;
  const valueW = totalsW - labelW;
  const pad = 12;

  const totalsRow = (label: string, value: string, isBold = false) => {
    const rowY = doc.y;

    bold();
    doc.fontSize(isBold ? 10 : 9).fillColor(dark);
    textNoWrap(label, totalsX + pad, rowY, labelW - pad, "left");

    if (isBold) bold();
    else regular();
    doc.fontSize(isBold ? 10 : 9).fillColor(dark);
    textNoWrap(value, totalsX + labelW, rowY, valueW - pad, "right");

    doc.y = rowY + 20;

    doc.save();
    doc.strokeColor(line).lineWidth(1);
    doc.moveTo(totalsX, doc.y - 6).lineTo(right, doc.y - 6).stroke();
    doc.restore();
  };

  totalsRow("Total Amount", formatNgn(subtotal));
  totalsRow("Discount", "0");
  totalsRow("Total", formatNgn(total), true);

  // =========================
  // Footer — moved up
  // =========================
  regular();
  doc.fontSize(9).fillColor(dark);
  doc.text("Thankyou for shopping with Manna", left, doc.page.height - 85);

  doc.end();
  const pdf = await done;

  return {
    pdf,
    invoiceNumber: invoiceMeta.invoiceNumber,
    orderNumber: order.orderNumber,
  };
}