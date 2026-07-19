-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CustomerOAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiConsoleExecutionRateLimit" (
    "adminId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiConsoleExecutionRateLimit_pkey" PRIMARY KEY ("adminId","routeId","windowStartedAt")
);

-- CreateIndex
CREATE INDEX "CustomerOAuthAccount_userId_idx" ON "CustomerOAuthAccount"("userId");

-- CreateIndex
CREATE INDEX "CustomerOAuthAccount_email_idx" ON "CustomerOAuthAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOAuthAccount_provider_providerAccountId_key" ON "CustomerOAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "ApiConsoleExecutionRateLimit_updatedAt_idx" ON "ApiConsoleExecutionRateLimit"("updatedAt");

-- AddForeignKey
ALTER TABLE "CustomerOAuthAccount" ADD CONSTRAINT "CustomerOAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiConsoleExecutionRateLimit" ADD CONSTRAINT "ApiConsoleExecutionRateLimit_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
