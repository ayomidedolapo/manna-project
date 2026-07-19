import { NextResponse, type NextRequest } from "next/server";
import { requireCustomerUser } from "@/lib/notifications/auth";
import { listNotifications } from "@/lib/notifications/notificationService";

export async function GET(req: NextRequest) {
  try {
    const user = await requireCustomerUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const notifications = await listNotifications({
      userId: user.id,
      role: "CUSTOMER",
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return NextResponse.json({ data: notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load notifications";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
