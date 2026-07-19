-- CreateTable
CREATE TABLE "VendorOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "marketClusterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pickupLocationId" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupContactName" TEXT,
    "pickupPhone" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "packingStartedAt" TIMESTAMP(3),
    "readyForPickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "readinessNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorOrderItem" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceNgn" INTEGER NOT NULL,
    "subtotalNgn" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorOrderReadinessEvent" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorOrderReadinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorOrder_orderId_idx" ON "VendorOrder"("orderId");

-- CreateIndex
CREATE INDEX "VendorOrder_vendorId_idx" ON "VendorOrder"("vendorId");

-- CreateIndex
CREATE INDEX "VendorOrder_marketClusterId_idx" ON "VendorOrder"("marketClusterId");

-- CreateIndex
CREATE INDEX "VendorOrder_status_idx" ON "VendorOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOrder_orderId_vendorId_key" ON "VendorOrder"("orderId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOrderItem_orderItemId_key" ON "VendorOrderItem"("orderItemId");

-- CreateIndex
CREATE INDEX "VendorOrderItem_vendorOrderId_idx" ON "VendorOrderItem"("vendorOrderId");

-- CreateIndex
CREATE INDEX "VendorOrderItem_productId_idx" ON "VendorOrderItem"("productId");

-- CreateIndex
CREATE INDEX "VendorOrderItem_productVariantId_idx" ON "VendorOrderItem"("productVariantId");

-- CreateIndex
CREATE INDEX "VendorOrderReadinessEvent_vendorOrderId_idx" ON "VendorOrderReadinessEvent"("vendorOrderId");

-- CreateIndex
CREATE INDEX "VendorOrderReadinessEvent_orderId_idx" ON "VendorOrderReadinessEvent"("orderId");

-- CreateIndex
CREATE INDEX "VendorOrderReadinessEvent_vendorId_idx" ON "VendorOrderReadinessEvent"("vendorId");

-- CreateIndex
CREATE INDEX "VendorOrderReadinessEvent_type_idx" ON "VendorOrderReadinessEvent"("type");

-- AddForeignKey
ALTER TABLE "VendorOrderItem" ADD CONSTRAINT "VendorOrderItem_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOrderReadinessEvent" ADD CONSTRAINT "VendorOrderReadinessEvent_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
