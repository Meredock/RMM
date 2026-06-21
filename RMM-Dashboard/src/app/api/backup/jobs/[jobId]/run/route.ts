import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBackupCommand, BackupConfigError } from "@/lib/backup-command";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { deviceId } = await req.json();

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  const [job, device] = await Promise.all([
    prisma.backupJob.findUnique({ where: { id: jobId } }),
    prisma.device.findUnique({ where: { id: deviceId } }),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  let command: string;
  try {
    ({ command } = buildBackupCommand(job));
  } catch (err) {
    if (err instanceof BackupConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const createdCommand = await prisma.command.create({
    data: { deviceId, command },
  });

  const run = await prisma.backupRun.create({
    data: { jobId, deviceId, commandId: createdCommand.id, status: "PENDING" },
  });

  return NextResponse.json(run, { status: 201 });
}
