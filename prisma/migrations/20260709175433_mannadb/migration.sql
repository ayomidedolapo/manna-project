/*
  Warnings:

  - You are about to drop the `CustomerOAuthAccount` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `phone` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `passwordHash` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorUserRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorAgreementStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VendorProductApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VENDOR';

-- DropForeignKey
ALTER TABLE "CustomerOAuthAccount" DROP CONSTRAINT "CustomerOAuthAccount_userId_fkey";

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "marketClusterId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "marketClusterId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approvalStatus" "VendorProductApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "marketClusterId" TEXT,
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "passwordHash" SET NOT NULL;

-- DropTable
DROP TABLE "CustomerOAuthAccount";

-- CreateTable
CREATE TABLE "MarketCluster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "centerAddress" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "pickupAddress" TEXT,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "supportPhone" TEXT,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "businessRegistrationNumber" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "commissionRateBps" INTEGER NOT NULL DEFAULT 1000,
    "marketClusterId" TEXT NOT NULL,
    "adminNotes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorUser" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "VendorUserRole" NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorVerification" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "identityStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "businessStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "contactStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "bankStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "productReviewStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAgreement" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "VendorAgreementStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "acceptedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBankAccount" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "paystackRecipientCode" TEXT,
    "rawVerification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPickupLocation" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "marketClusterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPickupLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketCluster_slug_key" ON "MarketCluster"("slug");

-- CreateIndex
CREATE INDEX "MarketCluster_city_state_idx" ON "MarketCluster"("city", "state");

-- CreateIndex
CREATE INDEX "MarketCluster_isActive_idx" ON "MarketCluster"("isActive");

-- CreateIndex
CREATE INDEX "MarketCluster_centerLat_centerLng_idx" ON "MarketCluster"("centerLat", "centerLng");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_email_key" ON "Vendor"("email");

-- CreateIndex
CREATE INDEX "Vendor_marketClusterId_idx" ON "Vendor"("marketClusterId");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- CreateIndex
CREATE INDEX "Vendor_isActive_isVisible_idx" ON "Vendor"("isActive", "isVisible");

-- CreateIndex
CREATE INDEX "VendorUser_userId_idx" ON "VendorUser"("userId");

-- CreateIndex
CREATE INDEX "VendorUser_vendorId_role_idx" ON "VendorUser"("vendorId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "VendorUser_vendorId_userId_key" ON "VendorUser"("vendorId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorVerification_vendorId_key" ON "VendorVerification"("vendorId");

-- CreateIndex
CREATE INDEX "VendorVerification_status_idx" ON "VendorVerification"("status");

-- CreateIndex
CREATE INDEX "VendorAgreement_vendorId_idx" ON "VendorAgreement"("vendorId");

-- CreateIndex
CREATE INDEX "VendorAgreement_status_idx" ON "VendorAgreement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAgreement_vendorId_title_version_key" ON "VendorAgreement"("vendorId", "title", "version");

-- CreateIndex
CREATE INDEX "VendorBankAccount_vendorId_idx" ON "VendorBankAccount"("vendorId");

-- CreateIndex
CREATE INDEX "VendorBankAccount_isDefault_idx" ON "VendorBankAccount"("isDefault");

-- CreateIndex
CREATE INDEX "VendorPickupLocation_vendorId_idx" ON "VendorPickupLocation"("vendorId");

-- CreateIndex
CREATE INDEX "VendorPickupLocation_marketClusterId_idx" ON "VendorPickupLocation"("marketClusterId");

-- CreateIndex
CREATE INDEX "VendorPickupLocation_isDefault_idx" ON "VendorPickupLocation"("isDefault");

-- CreateIndex
CREATE INDEX "VendorPickupLocation_isActive_idx" ON "VendorPickupLocation"("isActive");

-- CreateIndex
CREATE INDEX "Cart_marketClusterId_idx" ON "Cart"("marketClusterId");

-- CreateIndex
CREATE INDEX "Order_marketClusterId_idx" ON "Order"("marketClusterId");

-- CreateIndex
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");

-- CreateIndex
CREATE INDEX "Product_marketClusterId_idx" ON "Product"("marketClusterId");

-- CreateIndex
CREATE INDEX "Product_approvalStatus_idx" ON "Product"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_marketClusterId_fkey" FOREIGN KEY ("marketClusterId") REFERENCES "MarketCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketClusterId_fkey" FOREIGN KEY ("marketClusterId") REFERENCES "MarketCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_marketClusterId_fkey" FOREIGN KEY ("marketClusterId") REFERENCES "MarketCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_marketClusterId_fkey" FOREIGN KEY ("marketClusterId") REFERENCES "MarketCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorVerification" ADD CONSTRAINT "VendorVerification_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAgreement" ADD CONSTRAINT "VendorAgreement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccount" ADD CONSTRAINT "VendorBankAccount_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPickupLocation" ADD CONSTRAINT "VendorPickupLocation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPickupLocation" ADD CONSTRAINT "VendorPickupLocation_marketClusterId_fkey" FOREIGN KEY ("marketClusterId") REFERENCES "MarketCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
