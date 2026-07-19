import { NextResponse, type NextRequest } from "next/server";
import { syncKwikDeliveryStatusByDeliveryId } from "@/lib/kwik/statusSync";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");

  return authHeader === `Bearer ${cronSecret}` || headerSecret === cronSecret;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await syncKwikDeliveryStatusByDeliveryId(id);

  return NextResponse.json({
    ok: true,
    result,
  });
}
