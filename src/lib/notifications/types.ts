export type NotificationRole = "CUSTOMER" | "VENDOR" | "ADMIN";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type NotificationCategory =
  | "ORDER"
  | "DELIVERY"
  | "PAYMENT"
  | "VENDOR"
  | "SETTLEMENT"
  | "FEEDBACK"
  | "SECURITY"
  | "SYSTEM"
  | "MARKETING";

export type NotificationStatus = "UNREAD" | "READ" | "ARCHIVED";

export type PushPlatform = "WEB" | "ANDROID" | "IOS";

export type NotificationRecipientInput = {
  recipientRole: NotificationRole;
  recipientUserId?: string | null;
  vendorId?: string | null;
};

export type CreateNotificationInput = {
  eventType: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  body: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  imageUrl?: string | null;
  actorUserId?: string | null;
  orderId?: string | null;
  vendorId?: string | null;
  vendorOrderId?: string | null;
  deliveryId?: string | null;
  marketClusterId?: string | null;
  metadata?: Record<string, unknown> | null;
  recipients: NotificationRecipientInput[];
  sendPush?: boolean;
};

export type RegisterPushTokenInput = {
  userId: string;
  role: NotificationRole;
  token: string;
  platform: PushPlatform;
  vendorId?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
};

export type NotificationListItem = {
  id: string;
  recipientId: string;
  status: string;
  readAt: Date | null;
  createdAt: Date;
  notification: {
    id: string;
    eventType: string;
    category: string;
    priority: string;
    title: string;
    body: string;
    actionUrl: string | null;
    actionLabel: string | null;
    imageUrl: string | null;
    orderId: string | null;
    vendorId: string | null;
    vendorOrderId: string | null;
    deliveryId: string | null;
    marketClusterId: string | null;
    metadata: unknown;
    createdAt: Date;
  };
};
