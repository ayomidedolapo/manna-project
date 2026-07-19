/*
  Warnings:

  - A unique constraint covering the columns `[deliveryQuoteId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPickupCount" INTEGER,
ADD COLUMN     "deliveryQuoteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "deliveryQuoteId" TEXT,
ADD COLUMN     "deliveryQuoteSnapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Order_deliveryQuoteId_key" ON "Order"("deliveryQuoteId");
