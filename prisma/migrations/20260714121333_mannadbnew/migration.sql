-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mannaCommissionAmountNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settlementCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "settlementStatus" TEXT NOT NULL DEFAULT 'NOT_SETTLED',
ADD COLUMN     "vendorGrossAmountNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorPayableAmountNgn" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "lifetimeCommissionNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeGrossSalesNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimePaidOutNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minimumPayoutNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payableBalanceNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingSettlementNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settlementHoldDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settlementMode" TEXT NOT NULL DEFAULT 'MANUAL_PAYOUT';

-- AlterTable
ALTER TABLE "VendorOrder" ADD COLUMN     "commissionAmountNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commissionRateBps" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "grossAmountNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payableAmountNgn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settlementCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "settlementEligibleAt" TIMESTAMP(3),
ADD COLUMN     "settlementPaidAt" TIMESTAMP(3),
ADD COLUMN     "settlementStatus" TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE';

-- CreateTable
CREATE TABLE "VendorSettlement" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "marketClusterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYOUT',
    "grossAmountNgn" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "commissionAmountNgn" INTEGER NOT NULL,
    "payableAmountNgn" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "eligibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "payoutReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorLedgerEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT,
    "vendorOrderId" TEXT,
    "settlementId" TEXT,
    "entryType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountNgn" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorSettlement_vendorOrderId_key" ON "VendorSettlement"("vendorOrderId");

-- CreateIndex
CREATE INDEX "VendorSettlement_vendorId_idx" ON "VendorSettlement"("vendorId");

-- CreateIndex
CREATE INDEX "VendorSettlement_orderId_idx" ON "VendorSettlement"("orderId");

-- CreateIndex
CREATE INDEX "VendorSettlement_marketClusterId_idx" ON "VendorSettlement"("marketClusterId");

-- CreateIndex
CREATE INDEX "VendorSettlement_status_idx" ON "VendorSettlement"("status");

-- CreateIndex
CREATE INDEX "VendorSettlement_eligibleAt_idx" ON "VendorSettlement"("eligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorLedgerEntry_idempotencyKey_key" ON "VendorLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_vendorId_idx" ON "VendorLedgerEntry"("vendorId");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_orderId_idx" ON "VendorLedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_vendorOrderId_idx" ON "VendorLedgerEntry"("vendorOrderId");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_settlementId_idx" ON "VendorLedgerEntry"("settlementId");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_entryType_idx" ON "VendorLedgerEntry"("entryType");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_direction_idx" ON "VendorLedgerEntry"("direction");

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_createdAt_idx" ON "VendorLedgerEntry"("createdAt");
