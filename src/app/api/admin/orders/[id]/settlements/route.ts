import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getOrderSettlementSummary } from "@/lib/marketplace/vendorSettlement";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return admin.response;
    }

    const { id: orderId } = await ctx.params;
    const summary = await getOrderSettlementSummary(orderId);

    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
