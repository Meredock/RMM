-- Explicit session revocation timestamp (previously inferred from updatedAt) and
-- TOTP two-factor authentication fields.
ALTER TABLE "User" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "User" SET "sessionsRevokedAt" = "updatedAt";

ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpSecretEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
