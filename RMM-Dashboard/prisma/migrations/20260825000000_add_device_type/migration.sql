-- Classify managed endpoints so mobile agents can use appropriate dashboard
-- views and a longer offline threshold than desktop agents.
ALTER TABLE "Device" ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'desktop';

CREATE INDEX "Device_deviceType_idx" ON "Device"("deviceType");
