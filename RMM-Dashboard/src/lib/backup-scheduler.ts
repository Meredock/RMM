import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function startBackupScheduler() {
  setInterval(async () => {
    try {
      const due = await prisma.backupSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date() } },
        include: { job: true },
      });

      for (const schedule of due) {
        const archiveName = `${schedule.job.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-${new Date().toISOString().slice(0, 10)}`;
        const payload = JSON.stringify({
          sources: schedule.job.sources,
          exclude: schedule.job.exclude.length > 0 ? schedule.job.exclude : undefined,
          destination: schedule.job.destination || undefined,
          maxBytes: schedule.job.maxBytes || undefined,
          name: archiveName,
        });

        const command = await prisma.command.create({
          data: { deviceId: schedule.deviceId, command: `backup ${payload}` },
        });

        await prisma.backupRun.create({
          data: {
            jobId: schedule.jobId,
            scheduleId: schedule.id,
            deviceId: schedule.deviceId,
            commandId: command.id,
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
