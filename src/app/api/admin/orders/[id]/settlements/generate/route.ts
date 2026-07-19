import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createVendorSettlementsForDeliveredOrder } from "@/lib/marketplace/vendorSettlement";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return admin.response;
    }

    const { id: orderId } = await ctx.params;
    const result = await createVendorSettlementsForDeliveredOrder({
      orderId,
      actorUserId: admin.adminId,
      source: "ADMIN_GENERATE_SETTLEMENTS",
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
