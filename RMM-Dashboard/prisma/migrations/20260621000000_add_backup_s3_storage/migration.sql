-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('LOCAL', 'S3');

-- AlterTable
ALTER TABLE "BackupJob"
    ADD COLUMN "storageType" "StorageType" NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN "s3Bucket" TEXT,
    ADD COLUMN "s3Prefix" TEXT,
    ADD COLUMN "s3Region" TEXT,
    ADD COLUMN "s3Endpoint" TEXT;
