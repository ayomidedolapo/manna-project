import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { createDeliveryFromOrder } from "@/lib/delivery/createDeliveryFromOrder";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> }
) {
  try {
    const { deliveryId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const decoded = verifyAuthToken(token);

    if (!decoded || decoded.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        orderId: true,
        processingStatus: true,
        requiresManualDispatch: true,
        kwikTaskId: true,
      },
    });

    if (!delivery) {
      return NextResponse.json(
        { ok: false, message: "Delivery not found" },
        { status: 404 }
      );
    }

    if (delivery.kwikTaskId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Delivery has already been dispatched",
        },
        { status: 409 }
      );
    }

    if (delivery.processingStatus !== "QUEUED") {
      return NextResponse.json(
        {
          ok: false,
          message: "Delivery is not queued for manual dispatch",
        },
        { status: 409 }
      );
    }

    if (!delivery.requiresManualDispatch) {
      return NextResponse.json(
        {
          ok: false,
          message: "This delivery does not require manual dispatch",
        },
        { status: 409 }
      );
    }

    const claimed = await prisma.delivery.updateMany({
      where: {
        id: delivery.id,
        kwikTaskId: null,
        processingStatus: "QUEUED",
        requiresManualDispatch: true,
      },
      data: {
        processingStatus: "READY_FOR_DISPATCH",
        requiresManualDispatch: false,
        dispatchDeferredReason: null,
        scheduledDispatchAt: null,
      },
    });

    if (claimed.count !== 1) {
      return NextResponse.json(
        {
          ok: false,
          message: "Delivery dispatch is already being processed",
        },
        { status: 409 }
      );
    }

    const dispatchedDelivery = await createDeliveryFromOrder(delivery.orderId);

    return NextResponse.json({
      ok: true,
      message: "Delivery dispatched successfully",
      deliveryId: dispatchedDelivery.id,
      orderId: delivery.orderId,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Something went wrong";

    return NextResponse.json(
      { ok: false, message },
      { status: 400 }
    );
  }
}