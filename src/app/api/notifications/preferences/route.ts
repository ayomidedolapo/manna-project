import { NextResponse, type NextRequest } from "next/server";
import { requireCustomerUser } from "@/lib/notifications/auth";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreference,
} from "@/lib/notifications/notificationService";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export async function GET() {
  try {
    const user = await requireCustomerUser();
    const preferences = await getOrCreateNotificationPreferences({ userId: user.id, role: "CUSTOMER" });
    return NextResponse.json({ data: preferences });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load preferences";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCustomerUser();
    const body = await req.json().catch(() => null);

    if (!isJsonObject(body)) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }

    const category = readString(body.category);
    if (!category) {
      return NextResponse.json({ message: "category is required" }, { status: 400 });
    }

    const preference = await updateNotificationPreference({
      userId: user.id,
      role: "CUSTOMER",
      category,
      inAppEnabled: readBoolean(body.inAppEnabled),
      pushEnabled: readBoolean(body.pushEnabled),
      emailEnabled: readBoolean(body.emailEnabled),
      smsEnabled: readBoolean(body.smsEnabled),
    });

    return NextResponse.json({ data: preference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update preference";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
