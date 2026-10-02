-- Store only a SHA-256 hash of each agent API key. Existing keys keep working:
-- agents still send the plaintext key, which the server hashes to look it up.
ALTER TABLE "Device" ADD COLUMN "apiKeyHash" TEXT;
UPDATE "Device" SET "apiKeyHash" = encode(sha256(convert_to("apiKey", 'UTF8')), 'hex');
ALTER TABLE "Device" ALTER COLUMN "apiKeyHash" SET NOT NULL;

DROP INDEX "Device_apiKey_key";
ALTER TABLE "Device" DROP COLUMN "apiKey";
CREATE UNIQUE INDEX "Device_apiKeyHash_key" ON "Device"("apiKeyHash");
