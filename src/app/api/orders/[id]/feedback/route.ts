import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomerUser } from "@/lib/notifications/auth";
import { createNotification } from "@/lib/notifications/notificationService";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

async function notifyAdminsOfLowRating(orderId: string, rating: number, comment: string | null) {
  if (rating >= 3) return null;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (admins.length === 0) return null;

  return createNotification({
    eventType: "CUSTOMER_LOW_FEEDBACK",
    category: "FEEDBACK",
    priority: "HIGH",
    title: "Low customer feedback",
    body: `A customer rated order feedback ${rating}/5${comment ? `: ${comment}` : "."}`,
    actionUrl: `/admin/feedback?orderId=${orderId}`,
    actionLabel: "Review feedback",
    orderId,
    recipients: admins.map((admin) => ({ recipientRole: "ADMIN", recipientUserId: admin.id })),
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await ctx.params;
    const user = await requireCustomerUser();

    const feedback = await prisma.customerFeedback.findUnique({
      where: { orderId_userId: { orderId, userId: user.id } },
    });

    return NextResponse.json({ data: feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load feedback";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await ctx.params;
    const user = await requireCustomerUser();
    const body = await req.json().catch(() => null);

    if (!isJsonObject(body)) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ message: "rating must be an integer from 1 to 5" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: { id: true, status: true, paymentStatus: true },
    });

    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    if (order.status !== "DELIVERED") {
      return NextResponse.json({ message: "Feedback is only available after delivery" }, { status: 409 });
    }

    const comment = readString(body.comment);
    const tags = readTags(body.tags);

    const feedback = await prisma.customerFeedback.upsert({
      where: { orderId_userId: { orderId, userId: user.id } },
      update: {
        rating,
        comment,
        tags,
        status: "NEW",
      },
      create: {
        orderId,
        userId: user.id,
        rating,
        comment,
        tags,
      },
    });

    await notifyAdminsOfLowRating(orderId, rating, comment).catch(() => undefined);

    return NextResponse.json({ data: feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit feedback";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ message }, { status });
  }
}
