-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('PAYPAL', 'TKIERO');

-- AlterEnum
ALTER TYPE "JobPaymentStatus" ADD VALUE 'PENDING_PAYOUT';

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "jobPaymentId" TEXT,
ALTER COLUMN "transactionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "payoutMethod" "PayoutMethod",
ADD COLUMN     "paypalEmail" TEXT,
ADD COLUMN     "tkieroAccount" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "jobPaymentId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "reference" TEXT,
    "paidById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_jobPaymentId_key" ON "Payout"("jobPaymentId");

-- CreateIndex
CREATE INDEX "Payout_providerId_idx" ON "Payout"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_jobPaymentId_key" ON "Commission"("jobPaymentId");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "JobPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "JobPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A commission belongs to exactly one of: a marketplace Transaction or a JobPayment.
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_exactly_one_parent"
CHECK ((("transactionId" IS NOT NULL)::int + ("jobPaymentId" IS NOT NULL)::int) = 1);
