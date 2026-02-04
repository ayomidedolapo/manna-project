-- CreateEnum
CREATE TYPE "VariantUnit" AS ENUM ('PIECE', 'KG', 'PAINT', 'HALF_PAINT', 'BASKET');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "subCategory" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "unit" "VariantUnit" NOT NULL DEFAULT 'PIECE';

-- CreateIndex
CREATE INDEX "Product_subCategory_idx" ON "Product"("subCategory");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_unit_idx" ON "ProductVariant"("unit");
