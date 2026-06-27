-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "secretEnc" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Credential_companyId_idx" ON "Credential"("companyId");

-- CreateIndex
CREATE INDEX "CompanyDoc_companyId_idx" ON "CompanyDoc"("companyId");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDoc" ADD CONSTRAINT "CompanyDoc_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
