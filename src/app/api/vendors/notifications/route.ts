import { NextResponse, type NextRequest } from "next/server";
import { requireVendorContext } from "@/lib/notifications/auth";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications/notificationService";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const vendorId = url.searchParams.get("vendorId");
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const vendorContext = await requireVendorContext(vendorId);

    const notifications = await listNotifications({
      userId: vendorContext.user.id,
      role: "VENDOR",
      vendorId: vendorContext.vendorId,
      status,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return NextResponse.json({ data: notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load vendor notifications";
    const status = message.includes("Unauthorized") || message.includes("denied") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const vendorId = url.searchParams.get("vendorId");
    const vendorContext = await requireVendorContext(vendorId);

    const result = await markAllNotificationsRead({
      userId: vendorContext.user.id,
      role: "VENDOR",
      vendorId: vendorContext.vendorId,
    });

    return NextResponse.json({ message: "Vendor notifications marked as read", data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update vendor notifications";
    const status = message.includes("Unauthorized") || message.includes("denied") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
