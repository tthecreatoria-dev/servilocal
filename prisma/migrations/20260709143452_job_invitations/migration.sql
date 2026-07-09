-- AlterTable
ALTER TABLE "JobPost" ADD COLUMN     "invitedProviderId" TEXT;

-- CreateIndex
CREATE INDEX "JobPost_invitedProviderId_idx" ON "JobPost"("invitedProviderId");

-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_invitedProviderId_fkey" FOREIGN KEY ("invitedProviderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
