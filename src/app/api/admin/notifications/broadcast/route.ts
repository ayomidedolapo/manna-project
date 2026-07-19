import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/notifications/auth";
import { createNotification } from "@/lib/notifications/notificationService";
import type { NotificationCategory, NotificationPriority, NotificationRole } from "@/lib/notifications/types";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRole(value: unknown): NotificationRole | null {
  return value === "CUSTOMER" || value === "VENDOR" || value === "ADMIN" ? value : null;
}

function readCategory(value: unknown): NotificationCategory {
  const allowed = ["ORDER", "DELIVERY", "PAYMENT", "VENDOR", "SETTLEMENT", "FEEDBACK", "SECURITY", "SYSTEM", "MARKETING"];
  return typeof value === "string" && allowed.includes(value) ? (value as NotificationCategory) : "SYSTEM";
}

function readPriority(value: unknown): NotificationPriority {
  return value === "LOW" || value === "HIGH" || value === "URGENT" || value === "NORMAL" ? value : "NORMAL";
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser();
    const body = await req.json().catch(() => null);

    if (!isJsonObject(body)) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }

    const title = readString(body.title);
    const messageBody = readString(body.body);
    const recipientRole = readRole(body.recipientRole);

    if (!title || !messageBody || !recipientRole) {
      return NextResponse.json({ message: "title, body and recipientRole are required" }, { status: 400 });
    }

    const vendorId = readString(body.vendorId);
    const actionUrl = readString(body.actionUrl);
    const actionLabel = readString(body.actionLabel);

    const recipients =
      recipientRole === "VENDOR"
        ? await prisma.vendorUser.findMany({
            where: { isActive: true, ...(vendorId ? { vendorId } : {}) },
            select: { userId: true, vendorId: true },
          })
        : await prisma.user.findMany({
            where: { role: recipientRole },
            select: { id: true },
          });

    const notification = await createNotification({
      eventType: "ADMIN_BROADCAST",
      category: readCategory(body.category),
      priority: readPriority(body.priority),
      title,
      body: messageBody,
      actionUrl,
      actionLabel,
      actorUserId: admin.id,
      vendorId,
      metadata: { source: "admin_broadcast" },
      recipients: recipients.map((recipient) => {
        if ("userId" in recipient) {
          return {
            recipientRole: "VENDOR" as const,
            recipientUserId: recipient.userId,
            vendorId: recipient.vendorId,
          };
        }

        return {
          recipientRole,
          recipientUserId: recipient.id,
          vendorId: null,
        };
      }),
    });

    return NextResponse.json({ data: notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send broadcast";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
