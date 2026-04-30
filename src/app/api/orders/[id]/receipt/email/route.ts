import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrderAccess } from "@/lib/auth/requireOrderAccess";
import { getTransport } from "@/lib/email/mailer";
import { buildInvoicePdfStyled } from "@/lib/invoice/buildInvoicePdfStyled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    const access = await requireOrderAccess(id);
    if (!access.ok) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
    }

    const body = BodySchema.parse(await req.json().catch(() => ({})));

    const order = await prisma.order.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!order) return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });

    if (order.paymentStatus !== "PAID") {
      return NextResponse.json({ ok: false, message: "Order is not PAID yet" }, { status: 409 });
    }

    const toEmail =
      body.email ??
      (order.user?.email && order.user.email.includes("@") ? order.user.email : null);

    if (!toEmail) {
      return NextResponse.json(
        { ok: false, message: "No valid recipient email found (user has no email). Provide body.email" },
        { status: 400 }
      );
    }

    // ✅ SAME styled PDF used by invoice.pdf
    const { pdf, invoiceNumber, orderNumber } = await buildInvoicePdfStyled(id);

    const transport = getTransport();

    const from =
      process.env.RECEIPT_FROM_EMAIL ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "no-reply@manna.com";

    await transport.sendMail({
      from,
      to: toEmail,
      subject: `Manna Receipt — ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.5">
          <h2 style="margin:0 0 8px">Receipt / Invoice</h2>
          <p style="margin:0 0 10px">
            Order: <b>${orderNumber}</b><br/>
            Invoice: <b>${invoiceNumber}</b>
          </p>
          <p style="margin:0 0 14px">
            Your invoice is attached as a PDF.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    await prisma.order.update({
      where: { id },
      data: { receiptSentAt: new Date(), receiptEmailTo: toEmail },
    });

    return NextResponse.json({ ok: true, message: "Receipt email sent", to: toEmail, invoiceNumber });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    // ✅ internal failure is 500, not 400
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}