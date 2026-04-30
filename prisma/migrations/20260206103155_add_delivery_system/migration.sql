/*
  Warnings:

  - You are about to drop the column `deliveryStatus` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `kwikOrderId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `kwikTrackingUrl` on the `Order` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "deliveryStatus",
DROP COLUMN "kwikOrderId",
DROP COLUMN "kwikTrackingUrl";

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partner" "DeliveryPartner" NOT NULL DEFAULT 'KWIK',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'CREATED',
    "kwikTaskId" TEXT,
    "kwikTrackingUrl" TEXT,
    "kwikRawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_kwikTaskId_key" ON "Delivery"("kwikTaskId");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
