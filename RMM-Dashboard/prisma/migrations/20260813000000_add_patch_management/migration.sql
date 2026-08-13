-- CreateEnum
CREATE TYPE "PatchSource" AS ENUM ('WINDOWS_UPDATE', 'WINGET');

-- CreateEnum
CREATE TYPE "PatchSeverity" AS ENUM ('CRITICAL', 'IMPORTANT', 'MODERATE', 'LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PatchState" AS ENUM ('MISSING', 'INSTALLING', 'INSTALLED', 'FAILED', 'REBOOT_PENDING', 'RESOLVED');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lastPatchScanAt" TIMESTAMP(3),
ADD COLUMN     "rebootPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Patch" (
    "id" TEXT NOT NULL,
    "source" "PatchSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "severity" "PatchSeverity" NOT NULL DEFAULT 'UNKNOWN',
    "category" TEXT,
    "kb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePatchStatus" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "patchId" TEXT NOT NULL,
    "state" "PatchState" NOT NULL DEFAULT 'MISSING',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePatchStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patch_source_idx" ON "Patch"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Patch_source_externalId_version_key" ON "Patch"("source", "externalId", "version");

-- CreateIndex
CREATE INDEX "DevicePatchStatus_deviceId_state_idx" ON "DevicePatchStatus"("deviceId", "state");

-- CreateIndex
CREATE INDEX "DevicePatchStatus_state_idx" ON "DevicePatchStatus"("state");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePatchStatus_deviceId_patchId_key" ON "DevicePatchStatus"("deviceId", "patchId");

-- AddForeignKey
ALTER TABLE "DevicePatchStatus" ADD CONSTRAINT "DevicePatchStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePatchStatus" ADD CONSTRAINT "DevicePatchStatus_patchId_fkey" FOREIGN KEY ("patchId") REFERENCES "Patch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

