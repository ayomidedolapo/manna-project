import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyAuthToken } from "@/lib/auth";
import {
  assertUserCanAccessVendorOrder,
  markVendorOrderReady,
} from "@/lib/marketplace/vendorOrders";

const BodySchema = z.object({
  note: z.string().max(500).optional(),
});

function unauthorized() {
  return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorOrderId } = await ctx.params;
    const body = BodySchema.parse(await req.json().catch(() => ({})));

    const cookieStore = await cookies();
    const token = cookieStore.get("manna_token")?.value;
    const decoded = token ? verifyAuthToken(token) : null;

    if (!decoded?.userId) return unauthorized();

    await assertUserCanAccessVendorOrder(decoded.userId, vendorOrderId);

    const result = await markVendorOrderReady({
      vendorOrderId,
      actorUserId: decoded.userId,
      note: body.note,
    });

    return NextResponse.json(
      {
        ok: true,
        message: result.allReady
          ? "Vendor order is ready. All vendors are ready and Kwik dispatch has been attempted."
          : "Vendor order marked ready for pickup.",
        readiness: {
          vendorOrderId: result.vendorOrderId,
          orderId: result.orderId,
          status: result.status,
          totalVendorOrders: result.totalVendorOrders,
          readyVendorOrders: result.readyVendorOrders,
          allReady: result.allReady,
        },
        dispatch: result.dispatch,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
