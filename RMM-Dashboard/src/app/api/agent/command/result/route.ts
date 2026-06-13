import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Api-Key" }, { status: 401 });
  }

  const device = await prisma.device.findUnique({ where: { apiKey } });
  if (!device) {
    return NextResponse.json({ error: "Unknown device" }, { status: 401 });
  }

  const { commandId, output, exitCode, success } = await req.json();
  if (!commandId) {
    return NextResponse.json({ error: "commandId is required" }, { status: 400 });
  }

  const command = await prisma.command.findUnique({ where: { id: commandId } });
  if (!command || command.deviceId !== device.id) {
    return NextResponse.json({ error: "Command not found" }, { status: 404 });
  }

  const failed = success === false || (exitCode !== undefined && exitCode !== 0);

  await prisma.command.update({
    where: { id: commandId },
    data: {
      status: failed ? "FAILED" : "COMPLETED",
      output: output ?? null,
      exitCode: exitCode ?? null,
      completedAt: new Date(),
    },
  });

  // Update linked BackupRun if this command was a backup
  const backupRun = await prisma.backupRun.findUnique({ where: { commandId } });
  if (backupRun) {
    let archivePath: string | null = null;
    let files: number | null = null;
    let bytes: number | null = null;
    let skipped: number | null = null;

    if (!failed && output) {
      try {
        const result = JSON.parse(output);
        archivePath = result.archive ?? null;
        files = result.files ?? null;
        bytes = result.bytes ?? null;
        skipped = result.skipped ?? null;
      } catch {}
    }

    await prisma.backupRun.update({
      where: { id: backupRun.id },
      data: {
        status: failed ? "FAILED" : "COMPLETED",
        completedAt: new Date(),
        archivePath,
        files,
        bytes,
        skipped,
        error: failed ? (output ?? null) : null,
      },
    });
  }

  if (failed) {
    await prisma.alert.create({
      data: {
        deviceId: device.id,
        type: "COMMAND_FAILED",
        severity: "WARNING",
        message: `Command failed on ${device.name}: ${command.command}`,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
