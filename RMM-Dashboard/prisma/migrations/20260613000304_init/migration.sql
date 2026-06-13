-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `hostname` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `osVersion` VARCHAR(191) NULL,
    `apiKey` VARCHAR(191) NOT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `lastSeen` DATETIME(3) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `agentVersion` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Device_apiKey_key`(`apiKey`),
    INDEX `Device_isOnline_idx`(`isOnline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Metric` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cpuPercent` DOUBLE NOT NULL,
    `ramPercent` DOUBLE NOT NULL,
    `ramUsedMb` DOUBLE NOT NULL,
    `ramTotalMb` DOUBLE NOT NULL,
    `diskPercent` DOUBLE NOT NULL,
    `diskUsedGb` DOUBLE NOT NULL,
    `diskTotalGb` DOUBLE NOT NULL,

    INDEX `Metric_deviceId_timestamp_idx`(`deviceId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Command` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `command` TEXT NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT') NOT NULL DEFAULT 'PENDING',
    `output` TEXT NULL,
    `exitCode` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `executedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `Command_deviceId_status_idx`(`deviceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `type` ENUM('DEVICE_OFFLINE', 'HIGH_CPU', 'HIGH_RAM', 'HIGH_DISK', 'COMMAND_FAILED') NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `isResolved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Alert_isResolved_createdAt_idx`(`isResolved`, `createdAt`),
    INDEX `Alert_deviceId_idx`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertRule` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `type` ENUM('DEVICE_OFFLINE', 'HIGH_CPU', 'HIGH_RAM', 'HIGH_DISK', 'COMMAND_FAILED') NOT NULL,
    `threshold` DOUBLE NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupJob` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sources` JSON NOT NULL,
    `exclude` JSON NOT NULL,
    `destination` VARCHAR(191) NULL,
    `maxBytes` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `intervalMinutes` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupRun` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `commandId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `archivePath` VARCHAR(191) NULL,
    `files` INTEGER NULL,
    `bytes` DOUBLE NULL,
    `skipped` INTEGER NULL,
    `error` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `BackupRun_commandId_key`(`commandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Metric` ADD CONSTRAINT `Metric_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Command` ADD CONSTRAINT `Command_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupSchedule` ADD CONSTRAINT `BackupSchedule_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `BackupJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupSchedule` ADD CONSTRAINT `BackupSchedule_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRun` ADD CONSTRAINT `BackupRun_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `BackupJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRun` ADD CONSTRAINT `BackupRun_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `BackupSchedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRun` ADD CONSTRAINT `BackupRun_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRun` ADD CONSTRAINT `BackupRun_commandId_fkey` FOREIGN KEY (`commandId`) REFERENCES `Command`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
