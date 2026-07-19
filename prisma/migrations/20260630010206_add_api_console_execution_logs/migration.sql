/*
  Warnings:

  - The values [STARTED,BLOCKED] on the enum `ApiConsoleExecutionOutcome` will be removed. If these variants are still used in the database, this will fail.
  - Made the column `reason` on table `ApiConsoleExecutionLog` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApiConsoleExecutionOutcome_new" AS ENUM ('SUCCEEDED', 'FAILED');
ALTER TABLE "public"."ApiConsoleExecutionLog" ALTER COLUMN "outcome" DROP DEFAULT;
ALTER TABLE "ApiConsoleExecutionLog" ALTER COLUMN "outcome" TYPE "ApiConsoleExecutionOutcome_new" USING ("outcome"::text::"ApiConsoleExecutionOutcome_new");
ALTER TYPE "ApiConsoleExecutionOutcome" RENAME TO "ApiConsoleExecutionOutcome_old";
ALTER TYPE "ApiConsoleExecutionOutcome_new" RENAME TO "ApiConsoleExecutionOutcome";
DROP TYPE "public"."ApiConsoleExecutionOutcome_old";
COMMIT;

-- DropIndex
DROP INDEX "ApiConsoleExecutionLog_outcome_createdAt_idx";

-- AlterTable
ALTER TABLE "ApiConsoleExecutionLog" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "confirmationPhrase" TEXT,
ALTER COLUMN "outcome" DROP DEFAULT,
ALTER COLUMN "reason" SET NOT NULL;
