import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInvoice, formatNgn } from "@/lib/invoice/invoiceUtils";
import { requireOrderAccess } from "@/lib/auth/requireOrderAccess";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function safe(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    // ✅ IMPORTANT: dynamic import so PDFKit runs in real Node runtime
    const { default: PDFDocument } = await import("pdfkit");

    const { id } = await ctx.params;

    const access = await requireOrderAccess(id);
    if (!access.ok) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
    }

    const invoiceMeta = await ensureInvoice(id);

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
        items: { include: { product: true, productVariant: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

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

    // ✅ Use font buffer so PDFKit never touches fs internally
    doc.font(fontBuffer);

    const left = doc.page.margins.left; // 50
    const right = doc.page.width - doc.page.margins.right; // 545
    const contentW = right - left;

    // ===== Header =====
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
    doc.fontSize(10).text("Bill to:", left, 120);

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
      doc.text(`NOTE: ${order.deliveryNote}`);
    }

    doc.moveDown(1);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.6);

    // ===== Table =====
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

      subtotal += item.subtotalNgn ?? 0;

      doc.moveDown(1.2);

      if (doc.y > doc.page.height - 180) {
        doc.addPage();
        doc.font(fontBuffer);
      }
    }

    doc.moveDown(0.2);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(1);

    const delivery = order.deliveryFeeNgn ?? 0;
    const total = order.totalAmountNgn ?? subtotal + delivery;

    const totalsLabelW = 130;
    const totalsValW = 110;
    const totalsX = right - (totalsLabelW + totalsValW);

    const totalsRow = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.fontSize(bold ? 10 : 9);
      doc.text(label, totalsX, y, { width: totalsLabelW, align: "left" });
      doc.text(value, totalsX + totalsLabelW, y, { width: totalsValW, align: "right" });
      doc.moveDown(1.1);
    };

    totalsRow("Total Amount", formatNgn(subtotal));
    totalsRow("Discount", "0");
    totalsRow("Total", formatNgn(total), true);

    doc.fontSize(9).text("Thank you for shopping with Manna", left, doc.page.height - 90);

    doc.end();
    const pdf = await done;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoiceMeta.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}