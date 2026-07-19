import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { attemptCreateKwikTaskForReadyOrder } from "@/lib/marketplace/vendorOrders";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return admin.response;

    const { id: orderId } = await ctx.params;
    const dispatch = await attemptCreateKwikTaskForReadyOrder(orderId);

    const status = dispatch.created ? 201 : 200;

    return NextResponse.json(
      {
        ok: true,
        message: dispatch.created
          ? "Kwik multi-pickup task created."
          : "Kwik task was not created.",
        dispatch,
      },
      { status }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
