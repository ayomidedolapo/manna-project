import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken } from "@/lib/auth";
import { createDeliveryFromOrder } from "@/lib/delivery/createDeliveryFromOrder";

export async function POST(
  req: Request,
  { params }: { params: { deliveryId: string } }
) {
  try {
    const cookieStore = cookies();
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
      where: { id: params.deliveryId },
      include: { order: true },
    });

    if (!delivery) {
      return NextResponse.json(
        { ok: false, message: "Delivery not found" },
        { status: 404 }
      );
    }

    // Prevent dispatching if already dispatched
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

    // Update status first (safety)
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        processingStatus: "READY_FOR_DISPATCH",
        requiresManualDispatch: false,
        dispatchDeferredReason: null,
        scheduledDispatchAt: null,
      },
    });

    // Trigger KWIK delivery creation
    await createDeliveryFromOrder(delivery.orderId);

    return NextResponse.json({
      ok: true,
      message: "Delivery dispatched successfully",
      deliveryId: delivery.id,
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