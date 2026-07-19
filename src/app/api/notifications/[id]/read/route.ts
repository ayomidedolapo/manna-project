import { NextResponse, type NextRequest } from "next/server";
import { requireCustomerUser } from "@/lib/notifications/auth";
import { markNotificationRead } from "@/lib/notifications/notificationService";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const user = await requireCustomerUser();
    await markNotificationRead({ recipientId: id, userId: user.id });
    return NextResponse.json({ message: "Notification marked as read" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to mark notification as read";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
