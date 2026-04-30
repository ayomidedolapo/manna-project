-- DropIndex
DROP INDEX "Order_invoiceNumber_idx";

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "kwikVehicleId" INTEGER,
ADD COLUMN     "kwikVehicleLabel" TEXT,
ADD COLUMN     "totalWeightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "totalWeightKg" DOUBLE PRECISION;
