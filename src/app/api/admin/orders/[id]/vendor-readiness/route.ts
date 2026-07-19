import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/requireAdmin";

type VendorOrderForSummary = {
  id: string;
  orderId: string;
  vendorId: string;
  marketClusterId: string;
  status: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupContactName: string | null;
  pickupPhone: string | null;
  readyForPickupAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: unknown[];
};

function isReadyStatus(status: string): boolean {
  return status === "READY_FOR_PICKUP" || status === "PICKED_UP";
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    const { id: orderId } = await ctx.params;

    const [order, vendorOrders, kwikTask] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          status: true,
          marketClusterId: true,
          deliveryQuoteId: true,
          marketplaceFulfillmentStatus: true,
          vendorOrderCount: true,
          vendorReadyCount: true,
          readyForKwikAt: true,
          kwikTaskCreatedAt: true,
        },
      }),
      prisma.vendorOrder.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
        include: { items: true },
      }) as Promise<VendorOrderForSummary[]>,
      prisma.kwikDeliveryTask.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          kwikUniqueOrderId: true,
          kwikTrackingLinks: true,
          error: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!order) {
      return NextResponse.json({ ok: false, message: "Order not found" }, { status: 404 });
    }

    const totalVendorOrders = vendorOrders.length;
    const readyVendorOrders = vendorOrders.filter((vendorOrder) => isReadyStatus(vendorOrder.status)).length;

    return NextResponse.json(
      {
        ok: true,
        order,
        readiness: {
          totalVendorOrders,
          readyVendorOrders,
          allReady: totalVendorOrders > 0 && totalVendorOrders === readyVendorOrders,
        },
        vendorOrders,
        kwikTask,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
