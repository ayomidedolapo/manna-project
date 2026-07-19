import { prisma } from "@/lib/prisma";
import { isFirebaseConfigured, sendFirebasePush } from "./firebaseAdmin";
import type {
  CreateNotificationInput,
  NotificationCategory,
  NotificationListItem,
  NotificationRole,
  RegisterPushTokenInput,
} from "./types";

const DEFAULT_CATEGORIES: NotificationCategory[] = [
  "ORDER",
  "DELIVERY",
  "PAYMENT",
  "VENDOR",
  "SETTLEMENT",
  "FEEDBACK",
  "SECURITY",
  "SYSTEM",
  "MARKETING",
];

function stringFromUnknown(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNotificationData(input: CreateNotificationInput): Record<string, unknown> {
  return {
    eventType: input.eventType,
    category: input.category,
    priority: input.priority ?? "NORMAL",
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    actionLabel: input.actionLabel ?? null,
    imageUrl: input.imageUrl ?? null,
    actorUserId: input.actorUserId ?? null,
    orderId: input.orderId ?? null,
    vendorId: input.vendorId ?? null,
    vendorOrderId: input.vendorOrderId ?? null,
    deliveryId: input.deliveryId ?? null,
    marketClusterId: input.marketClusterId ?? null,
    metadata: input.metadata ?? null,
    recipients: {
      create: input.recipients.map((recipient) => ({
        recipientUserId: recipient.recipientUserId ?? null,
        recipientRole: recipient.recipientRole,
        vendorId: recipient.vendorId ?? null,
        deliveredAt: new Date(),
      })),
    },
  };
}

export async function createNotification(input: CreateNotificationInput) {
  if (input.recipients.length === 0) {
    throw new Error("Notification requires at least one recipient.");
  }

  const notification = await prisma.notification.create({
    data: toNotificationData(input) as never,
    include: { recipients: true },
  });

  if (input.sendPush !== false) {
    await sendPushForNotification(notification.id).catch(() => undefined);
  }

  return notification;
}

export async function registerPushDeviceToken(input: RegisterPushTokenInput) {
  return prisma.pushDeviceToken.upsert({
    where: { token: input.token },
    update: {
      userId: input.userId,
      role: input.role,
      vendorId: input.vendorId ?? null,
      platform: input.platform,
      deviceId: input.deviceId ?? null,
      appVersion: input.appVersion ?? null,
      userAgent: input.userAgent ?? null,
      isActive: true,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: input.userId,
      role: input.role,
      vendorId: input.vendorId ?? null,
      token: input.token,
      platform: input.platform,
      deviceId: input.deviceId ?? null,
      appVersion: input.appVersion ?? null,
      userAgent: input.userAgent ?? null,
      isActive: true,
    },
  });
}

export async function revokePushDeviceToken(token: string, userId: string) {
  return prisma.pushDeviceToken.updateMany({
    where: { token, userId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });
}

async function getPreference(userId: string, role: string, category: string, vendorId?: string | null) {
  const preference = await prisma.notificationPreference.findFirst({
    where: {
      userId,
      role,
      category,
      vendorId: vendorId ?? null,
    },
    select: {
      inAppEnabled: true,
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: true,
    },
  });

  return preference ?? {
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    smsEnabled: false,
  };
}

export async function sendPushForNotification(notificationId: string) {
  if (!isFirebaseConfigured()) {
    return { skipped: true, reason: "Firebase is not configured." };
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { recipients: true },
  });

  if (!notification) {
    return { skipped: true, reason: "Notification not found." };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of notification.recipients) {
    if (!recipient.recipientUserId) {
      continue;
    }

    const preference = await getPreference(
      recipient.recipientUserId,
      recipient.recipientRole,
      notification.category,
      recipient.vendorId,
    );

    if (!preference.pushEnabled) {
      await prisma.notificationDeliveryAttempt.create({
        data: {
          notificationRecipientId: recipient.id,
          channel: "PUSH",
          status: "SKIPPED",
          provider: "FIREBASE",
          providerMessage: "Push disabled by preference.",
        },
      });
      continue;
    }

    const tokens = await prisma.pushDeviceToken.findMany({
      where: {
        userId: recipient.recipientUserId,
        role: recipient.recipientRole,
        isActive: true,
        ...(recipient.vendorId ? { vendorId: recipient.vendorId } : {}),
      },
      select: { token: true },
    });

    const result = await sendFirebasePush(tokens.map((item) => item.token), {
      title: notification.title,
      body: notification.body,
      actionUrl: notification.actionUrl,
      imageUrl: notification.imageUrl,
      data: {
        notificationId: notification.id,
        recipientId: recipient.id,
        eventType: notification.eventType,
        category: notification.category,
        orderId: notification.orderId ?? "",
        vendorId: notification.vendorId ?? "",
        vendorOrderId: notification.vendorOrderId ?? "",
        deliveryId: notification.deliveryId ?? "",
      },
    });

    if (result.invalidTokens.length > 0) {
      await prisma.pushDeviceToken.updateMany({
        where: { token: { in: result.invalidTokens } },
        data: { isActive: false, revokedAt: new Date() },
      });
    }

    sentCount += result.successCount;
    failedCount += result.failureCount;

    await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        pushSentAt: result.successCount > 0 ? new Date() : recipient.pushSentAt,
        pushFailedAt: result.failureCount > 0 ? new Date() : recipient.pushFailedAt,
      },
    });

    await prisma.notificationDeliveryAttempt.create({
      data: {
        notificationRecipientId: recipient.id,
        channel: "PUSH",
        status: result.failureCount > 0 ? "FAILED" : "SENT",
        provider: "FIREBASE",
        providerMessage: `success=${result.successCount}; failure=${result.failureCount}`,
      },
    });
  }

  return { skipped: false, sentCount, failedCount };
}

export async function listNotifications(params: {
  userId: string;
  role: NotificationRole;
  vendorId?: string | null;
  status?: string | null;
  limit?: number;
}): Promise<NotificationListItem[]> {
  const rows = await prisma.notificationRecipient.findMany({
    where: {
      recipientUserId: params.userId,
      recipientRole: params.role,
      ...(params.vendorId ? { vendorId: params.vendorId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(params.limit ?? 50, 100),
    include: {
      notification: true,
    },
  });

  const mapped = rows.map((r) => ({
    id: r.id,
    recipientId: r.id,
    status: r.status,
    createdAt: r.createdAt,
    readAt: r.readAt,
    notification: r.notification,
  }));

  return mapped as NotificationListItem[];
}

export async function markNotificationRead(params: { recipientId: string; userId: string }) {
  return prisma.notificationRecipient.updateMany({
    where: {
      id: params.recipientId,
      recipientUserId: params.userId,
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsRead(params: {
  userId: string;
  role: NotificationRole;
  vendorId?: string | null;
}) {
  return prisma.notificationRecipient.updateMany({
    where: {
      recipientUserId: params.userId,
      recipientRole: params.role,
      ...(params.vendorId ? { vendorId: params.vendorId } : {}),
      status: "UNREAD",
    },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });
}

export async function getOrCreateNotificationPreferences(params: {
  userId: string;
  role: NotificationRole;
  vendorId?: string | null;
}) {
  const existing = await prisma.notificationPreference.findMany({
    where: {
      userId: params.userId,
      role: params.role,
      vendorId: params.vendorId ?? null,
    },
    orderBy: { category: "asc" },
  });

  if (existing.length > 0) {
    return existing;
  }

  await prisma.notificationPreference.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId: params.userId,
      role: params.role,
      vendorId: params.vendorId ?? null,
      category,
      inAppEnabled: true,
      pushEnabled: category !== "MARKETING",
      emailEnabled: false,
      smsEnabled: false,
    })),
    skipDuplicates: true,
  });

  return prisma.notificationPreference.findMany({
    where: {
      userId: params.userId,
      role: params.role,
      vendorId: params.vendorId ?? null,
    },
    orderBy: { category: "asc" },
  });
}

export async function updateNotificationPreference(params: {
  userId: string;
  role: NotificationRole;
  category: string;
  vendorId?: string | null;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
}) {
  const existing = await prisma.notificationPreference.findFirst({
    where: {
      userId: params.userId,
      role: params.role,
      vendorId: params.vendorId ?? null,
      category: params.category,
    },
    select: { id: true },
  });

  const data = {
    pushEnabled: params.pushEnabled,
    inAppEnabled: params.inAppEnabled,
    emailEnabled: params.emailEnabled,
    smsEnabled: params.smsEnabled,
  };

  if (existing) {
    return prisma.notificationPreference.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.notificationPreference.create({
    data: {
      userId: params.userId,
      role: params.role,
      vendorId: params.vendorId ?? null,
      category: params.category,
      inAppEnabled: params.inAppEnabled ?? true,
      pushEnabled: params.pushEnabled ?? true,
      emailEnabled: params.emailEnabled ?? false,
      smsEnabled: params.smsEnabled ?? false,
    },
  });
}

export function parseOptionalString(value: unknown): string | null {
  return stringFromUnknown(value);
}
