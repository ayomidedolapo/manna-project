-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "imageUrl" TEXT,
    "actorUserId" TEXT,
    "orderId" TEXT,
    "vendorId" TEXT,
    "vendorOrderId" TEXT,
    "deliveryId" TEXT,
    "marketClusterId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientRole" TEXT NOT NULL,
    "vendorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "pushSentAt" TIMESTAMP(3),
    "pushFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "vendorId" TEXT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "vendorId" TEXT,
    "category" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "notificationRecipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerMessage" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "tags" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_eventType_idx" ON "Notification"("eventType");

-- CreateIndex
CREATE INDEX "Notification_category_idx" ON "Notification"("category");

-- CreateIndex
CREATE INDEX "Notification_priority_idx" ON "Notification"("priority");

-- CreateIndex
CREATE INDEX "Notification_orderId_idx" ON "Notification"("orderId");

-- CreateIndex
CREATE INDEX "Notification_vendorId_idx" ON "Notification"("vendorId");

-- CreateIndex
CREATE INDEX "Notification_vendorOrderId_idx" ON "Notification"("vendorOrderId");

-- CreateIndex
CREATE INDEX "Notification_deliveryId_idx" ON "Notification"("deliveryId");

-- CreateIndex
CREATE INDEX "Notification_marketClusterId_idx" ON "Notification"("marketClusterId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_idx" ON "NotificationRecipient"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientUserId_idx" ON "NotificationRecipient"("recipientUserId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientRole_idx" ON "NotificationRecipient"("recipientRole");

-- CreateIndex
CREATE INDEX "NotificationRecipient_vendorId_idx" ON "NotificationRecipient"("vendorId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_status_idx" ON "NotificationRecipient"("status");

-- CreateIndex
CREATE INDEX "NotificationRecipient_createdAt_idx" ON "NotificationRecipient"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDeviceToken_token_key" ON "PushDeviceToken"("token");

-- CreateIndex
CREATE INDEX "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");

-- CreateIndex
CREATE INDEX "PushDeviceToken_role_idx" ON "PushDeviceToken"("role");

-- CreateIndex
CREATE INDEX "PushDeviceToken_vendorId_idx" ON "PushDeviceToken"("vendorId");

-- CreateIndex
CREATE INDEX "PushDeviceToken_isActive_idx" ON "PushDeviceToken"("isActive");

-- CreateIndex
CREATE INDEX "PushDeviceToken_lastSeenAt_idx" ON "PushDeviceToken"("lastSeenAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_role_idx" ON "NotificationPreference"("role");

-- CreateIndex
CREATE INDEX "NotificationPreference_vendorId_idx" ON "NotificationPreference"("vendorId");

-- CreateIndex
CREATE INDEX "NotificationPreference_category_idx" ON "NotificationPreference"("category");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_role_vendorId_category_key" ON "NotificationPreference"("userId", "role", "vendorId", "category");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_notificationRecipientId_idx" ON "NotificationDeliveryAttempt"("notificationRecipientId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_channel_idx" ON "NotificationDeliveryAttempt"("channel");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_status_idx" ON "NotificationDeliveryAttempt"("status");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_provider_idx" ON "NotificationDeliveryAttempt"("provider");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_attemptedAt_idx" ON "NotificationDeliveryAttempt"("attemptedAt");

-- CreateIndex
CREATE INDEX "CustomerFeedback_orderId_idx" ON "CustomerFeedback"("orderId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_userId_idx" ON "CustomerFeedback"("userId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_rating_idx" ON "CustomerFeedback"("rating");

-- CreateIndex
CREATE INDEX "CustomerFeedback_status_idx" ON "CustomerFeedback"("status");

-- CreateIndex
CREATE INDEX "CustomerFeedback_createdAt_idx" ON "CustomerFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFeedback_orderId_userId_key" ON "CustomerFeedback"("orderId", "userId");

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_notificationRecipientId_fkey" FOREIGN KEY ("notificationRecipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
