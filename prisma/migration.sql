-- AlterTable
ALTER TABLE "KOT" ADD COLUMN "prepTimeMinutes" INTEGER;
ALTER TABLE "KOT" ADD COLUMN "estimatedReadyTime" DATETIME;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "prepTimeMinutes" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "countdownStartedAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "estimatedCompletionTime" DATETIME;