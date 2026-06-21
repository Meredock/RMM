import { PrismaClient } from "@prisma/client";
import { buildBackupCommand, BackupConfigError } from "./backup-command";

const prisma = new PrismaClient();

export function startBackupScheduler() {
  setInterval(async () => {
    try {
      const due = await prisma.backupSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date() } },
        include: { job: true },
      });

      for (const schedule of due) {
        let command: string;
        try {
          ({ command } = buildBackupCommand(schedule.job));
        } catch (err) {
          if (err instanceof BackupConfigError) {
            console.error(
              `[backup-scheduler] Skipping "${schedule.job.name}": ${err.message}`
            );
            // Push the next attempt out so we don't spin every minute on a
            // misconfigured job.
            await prisma.backupSchedule.update({
              where: { id: schedule.id },
              data: { nextRunAt: new Date(Date.now() + schedule.intervalMinutes * 60_000) },
            });
            continue;
          }
          throw err;
        }

        const createdCommand = await prisma.command.create({
          data: { deviceId: schedule.deviceId, command },
        });

        await prisma.backupRun.create({
          data: {
            jobId: schedule.jobId,
            scheduleId: schedule.id,
            deviceId: schedule.deviceId,
            commandId: createdCommand.id,
            status: "PENDING",
          },
        });

        const nextRunAt = new Date(Date.now() + schedule.intervalMinutes * 60_000);
        await prisma.backupSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date(), nextRunAt },
        });

        console.log(
          `[backup-scheduler] Dispatched: "${schedule.job.name}" → device ${schedule.deviceId}`
        );
      }
    } catch (err) {
      console.error("[backup-scheduler] Error:", err);
    }
  }, 60_000);

  console.log("[backup-scheduler] Started (checking every 60s)");
}
