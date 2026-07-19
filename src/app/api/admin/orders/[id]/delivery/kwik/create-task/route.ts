import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isJsonObject, requiredString } from "@/lib/marketplace/json";
import { createKwikMarketplaceTaskFromStoredQuote } from "@/lib/kwik/quoteService";

type CreateTaskBody = {
  deliveryQuoteId: string;
};

type DeliveryQuoteForTask = {
  id: string;
  userId: string | null;
  cartId: string | null;
  orderId: string | null;
  marketClusterId: string;
  status: string;
  quoteExpiresAt: Date;
  pickupCount: number;
  deliveryCount: number;
  rawQuoteRequest: Record<string, unknown>;
  rawQuoteResponse: Record<string, unknown> | null;
  rawBillResponse: Record<string, unknown> | null;
};

type OrderDeliveryRecord = {
  id: string;
  delivery: { id: string } | null;
};

function parseBody(value: unknown): CreateTaskBody | null {
  if (!isJsonObject(value)) return null;

  const deliveryQuoteId = requiredString(value.deliveryQuoteId);

  return deliveryQuoteId ? { deliveryQuoteId } : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    const { id: orderId } = await ctx.params;
    const body = parseBody(await req.json());

    if (!body) {
      return NextResponse.json(
        { message: "deliveryQuoteId is required" },
        { status: 400 }
      );
    }

    const order = (await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        delivery: { select: { id: true } },
      },
    })) as OrderDeliveryRecord | null;

    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    const existingTask = await prisma.kwikDeliveryTask.findFirst({
      where: { orderId, status: "CREATED" },
      select: { id: true, kwikUniqueOrderId: true, kwikTrackingLinks: true },
    });

    if (existingTask) {
      return NextResponse.json(
        { message: "Kwik task already created for this order", task: existingTask },
        { status: 409 }
      );
    }

    const quote = (await prisma.deliveryQuote.findUnique({
      where: { id: body.deliveryQuoteId },
      select: {
        id: true,
        userId: true,
        cartId: true,
        orderId: true,
        marketClusterId: true,
        status: true,
        quoteExpiresAt: true,
        pickupCount: true,
        deliveryCount: true,
        rawQuoteRequest: true,
        rawQuoteResponse: true,
        rawBillResponse: true,
      },
    })) as DeliveryQuoteForTask | null;

    if (!quote) {
      return NextResponse.json({ message: "Delivery quote not found" }, { status: 404 });
    }

    if (quote.status !== "QUOTED") {
      return NextResponse.json(
        { message: `Delivery quote is not usable. Current status: ${quote.status}` },
        { status: 409 }
      );
    }

    if (quote.quoteExpiresAt.getTime() < Date.now()) {
      await prisma.deliveryQuote.update({
        where: { id: quote.id },
        data: { status: "EXPIRED" } as never,
      });

      return NextResponse.json({ message: "Delivery quote has expired" }, { status: 409 });
    }

    if (!quote.rawQuoteResponse || !quote.rawBillResponse) {
      return NextResponse.json(
        { message: "Delivery quote does not contain complete Kwik quote data" },
        { status: 409 }
      );
    }

    const result = await createKwikMarketplaceTaskFromStoredQuote({
      quotePayload: quote.rawQuoteRequest,
      quoteResponse: quote.rawQuoteResponse,
      billResponse: quote.rawBillResponse,
    });

    const task = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.kwikDeliveryTask.create({
        data: {
          orderId,
          deliveryId: order.delivery?.id,
          deliveryQuoteId: quote.id,
          marketClusterId: quote.marketClusterId,
          status: "CREATED",
          pickupCount: quote.pickupCount,
          deliveryCount: quote.deliveryCount,
          kwikUniqueOrderId: result.kwikUniqueOrderId,
          kwikPickupJobIds: result.kwikPickupJobIds,
          kwikDeliveryJobIds: result.kwikDeliveryJobIds,
          kwikJobToken: result.kwikJobToken,
          kwikStatusCheckUrl: result.kwikStatusCheckUrl,
          kwikTrackingLinks: result.kwikTrackingLinks,
          rawCreateRequest: result.createPayload,
          rawCreateResponse: result.createResponse,
        } as never,
        select: {
          id: true,
          orderId: true,
          deliveryQuoteId: true,
          status: true,
          kwikUniqueOrderId: true,
          kwikStatusCheckUrl: true,
          kwikTrackingLinks: true,
          pickupCount: true,
          deliveryCount: true,
        },
      });

      await tx.deliveryQuote.update({
        where: { id: quote.id },
        data: { orderId, status: "USED" } as never,
      });

      if (order.delivery?.id) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: {
            status: "CREATED",
            processingStatus: "DISPATCHED",
            kwikUniqueOrderId: result.kwikUniqueOrderId,
            kwikStatusCheckUrl: result.kwikStatusCheckUrl,
            kwikTrackingUrl: result.kwikTrackingLinks[0] ?? null,
            kwikRawResponse: result.createResponse,
          } as never,
        });
      }

      return createdTask;
    });

    return NextResponse.json(
      { message: "Kwik delivery task created", task },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("KWIK_CREATE_TASK_ERROR", error);

    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ message }, { status: 500 });
  }
}
