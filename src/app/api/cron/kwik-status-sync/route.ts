import { NextResponse, type NextRequest } from "next/server";
import { syncDueKwikDeliveries } from "@/lib/kwik/statusSync";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");

  return authHeader === `Bearer ${cronSecret}` || headerSecret === cronSecret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : 25;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 50)
    : 25;

  const results = await syncDueKwikDeliveries(limit);

  return NextResponse.json({
    ok: true,
    synced: results.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
