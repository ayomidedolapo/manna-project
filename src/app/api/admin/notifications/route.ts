import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/notifications/auth";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications/notificationService";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const notifications = await listNotifications({
      userId: admin.id,
      role: "ADMIN",
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return NextResponse.json({ data: notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin notifications";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(_req: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const result = await markAllNotificationsRead({ userId: admin.id, role: "ADMIN" });
    return NextResponse.json({ message: "Admin notifications marked as read", data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update admin notifications";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
