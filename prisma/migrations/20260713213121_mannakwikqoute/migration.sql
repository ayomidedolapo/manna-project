-- CreateEnum
CREATE TYPE "DeliveryQuoteStatus" AS ENUM ('DRAFT', 'QUOTED', 'FAILED', 'EXPIRED', 'USED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KwikDeliveryTaskStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DeliveryQuote" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cartId" TEXT,
    "orderId" TEXT,
    "marketClusterId" TEXT NOT NULL,
    "pickupCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "kwikPerTaskCostNgn" INTEGER,
    "kwikTotalServiceChargeNgn" INTEGER,
    "kwikPayableAmountNgn" INTEGER,
    "kwikNetPayableAmountNgn" INTEGER,
    "kwikDeliveryChargeNgn" INTEGER,
    "kwikSurgeCostNgn" INTEGER,
    "kwikSurgeType" INTEGER,
    "kwikVehicleId" INTEGER,
    "kwikVehicleName" TEXT,
    "amountToChargeCustomerNgn" INTEGER NOT NULL DEFAULT 0,
    "rawQuoteRequest" JSONB NOT NULL,
    "rawQuoteResponse" JSONB,
    "rawBillRequest" JSONB,
    "rawBillResponse" JSONB,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KwikDeliveryTask" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "deliveryId" TEXT,
    "deliveryQuoteId" TEXT,
    "marketClusterId" TEXT,
    "status" "KwikDeliveryTaskStatus" NOT NULL DEFAULT 'PENDING',
    "pickupCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "kwikUniqueOrderId" TEXT,
    "kwikPickupJobIds" JSONB,
    "kwikDeliveryJobIds" JSONB,
    "kwikJobToken" TEXT,
    "kwikStatusCheckUrl" TEXT,
    "kwikTrackingLinks" JSONB,
    "rawCreateRequest" JSONB NOT NULL,
    "rawCreateResponse" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KwikDeliveryTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryQuote_userId_idx" ON "DeliveryQuote"("userId");

-- CreateIndex
CREATE INDEX "DeliveryQuote_cartId_idx" ON "DeliveryQuote"("cartId");

-- CreateIndex
CREATE INDEX "DeliveryQuote_orderId_idx" ON "DeliveryQuote"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryQuote_marketClusterId_idx" ON "DeliveryQuote"("marketClusterId");

-- CreateIndex
CREATE INDEX "DeliveryQuote_status_idx" ON "DeliveryQuote"("status");

-- CreateIndex
CREATE INDEX "DeliveryQuote_quoteExpiresAt_idx" ON "DeliveryQuote"("quoteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "KwikDeliveryTask_deliveryId_key" ON "KwikDeliveryTask"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "KwikDeliveryTask_kwikUniqueOrderId_key" ON "KwikDeliveryTask"("kwikUniqueOrderId");

-- CreateIndex
CREATE INDEX "KwikDeliveryTask_orderId_idx" ON "KwikDeliveryTask"("orderId");

-- CreateIndex
CREATE INDEX "KwikDeliveryTask_deliveryQuoteId_idx" ON "KwikDeliveryTask"("deliveryQuoteId");

-- CreateIndex
CREATE INDEX "KwikDeliveryTask_marketClusterId_idx" ON "KwikDeliveryTask"("marketClusterId");

-- CreateIndex
CREATE INDEX "KwikDeliveryTask_status_idx" ON "KwikDeliveryTask"("status");
