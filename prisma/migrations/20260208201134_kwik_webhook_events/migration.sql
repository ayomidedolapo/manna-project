-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "kwikJobStatus" INTEGER,
ADD COLUMN     "kwikUniqueOrderId" TEXT,
ADD COLUMN     "lastStatusCheckAt" TIMESTAMP(3),
ADD COLUMN     "lastStatusCheckError" TEXT,
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "nextStatusCheckAt" TIMESTAMP(3),
ADD COLUMN     "statusCheckAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeliveryWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'KWIK',
    "dedupeHash" TEXT NOT NULL,
    "jobId" TEXT,
    "uniqueOrderId" TEXT,
    "jobStatus" INTEGER,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,

    CONSTRAINT "DeliveryWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryWebhookEvent_dedupeHash_key" ON "DeliveryWebhookEvent"("dedupeHash");

-- CreateIndex
CREATE INDEX "DeliveryWebhookEvent_jobId_idx" ON "DeliveryWebhookEvent"("jobId");

-- CreateIndex
CREATE INDEX "DeliveryWebhookEvent_uniqueOrderId_idx" ON "DeliveryWebhookEvent"("uniqueOrderId");

-- CreateIndex
CREATE INDEX "DeliveryWebhookEvent_status_idx" ON "DeliveryWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "Delivery_kwikUniqueOrderId_idx" ON "Delivery"("kwikUniqueOrderId");

-- CreateIndex
CREATE INDEX "Delivery_nextStatusCheckAt_idx" ON "Delivery"("nextStatusCheckAt");
