-- CreateEnum
CREATE TYPE "DeliveryProcessingStatus" AS ENUM ('PENDING', 'QUEUED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "dispatchDeferredReason" TEXT,
ADD COLUMN     "processingStatus" "DeliveryProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "requiresManualDispatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledDispatchAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Delivery_processingStatus_idx" ON "Delivery"("processingStatus");

-- CreateIndex
CREATE INDEX "Delivery_requiresManualDispatch_idx" ON "Delivery"("requiresManualDispatch");

-- CreateIndex
CREATE INDEX "Delivery_scheduledDispatchAt_idx" ON "Delivery"("scheduledDispatchAt");
