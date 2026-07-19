-- CreateEnum
CREATE TYPE "ApiConsoleExecutionOutcome" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminFailedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "adminLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApiConsoleExecutionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "outcome" "ApiConsoleExecutionOutcome" NOT NULL DEFAULT 'STARTED',
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "reason" TEXT,
    "requestPathParams" JSONB,
    "requestQuery" JSONB,
    "requestBody" JSONB,
    "responsePreview" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiConsoleExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiConsoleExecutionLog_adminId_createdAt_idx" ON "ApiConsoleExecutionLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiConsoleExecutionLog_routeId_createdAt_idx" ON "ApiConsoleExecutionLog"("routeId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiConsoleExecutionLog_outcome_createdAt_idx" ON "ApiConsoleExecutionLog"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "ApiConsoleExecutionLog" ADD CONSTRAINT "ApiConsoleExecutionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
