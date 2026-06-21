-- CreateTable
CREATE TABLE "HttpMonitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "expectedStatus" INTEGER,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "deviceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOk" BOOLEAN,
    "lastStatus" INTEGER,
    "lastDurationMs" INTEGER,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HttpMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HttpCheck" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "status" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'server',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HttpCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HttpMonitor_enabled_nextRunAt_idx" ON "HttpMonitor"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "HttpCheck_monitorId_checkedAt_idx" ON "HttpCheck"("monitorId", "checkedAt");

-- AddForeignKey
ALTER TABLE "HttpMonitor" ADD CONSTRAINT "HttpMonitor_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HttpCheck" ADD CONSTRAINT "HttpCheck_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "HttpMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
