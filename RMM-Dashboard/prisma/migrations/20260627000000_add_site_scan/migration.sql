-- CreateTable
CREATE TABLE "SiteScan" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "companyId" TEXT,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteScan_createdAt_idx" ON "SiteScan"("createdAt");

-- CreateIndex
CREATE INDEX "SiteScan_companyId_idx" ON "SiteScan"("companyId");
