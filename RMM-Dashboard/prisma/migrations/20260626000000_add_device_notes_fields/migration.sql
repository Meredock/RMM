-- AlterTable
ALTER TABLE "Device" ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "DeviceField" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "DeviceField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceField_deviceId_key_key" ON "DeviceField"("deviceId", "key");

-- AddForeignKey
ALTER TABLE "DeviceField" ADD CONSTRAINT "DeviceField_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
