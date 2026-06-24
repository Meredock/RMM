import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCheckResult } from "@/lib/http-monitor";
import { createAlert } from "@/lib/alerts";
import { notify } from "@/lib/notify";

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
        // `location` is the final resting place (remote URL when uploaded to
        // S3, otherwise the local path); fall back to `archive` for older agents.
        archivePath = result.location ?? result.archive ?? null;
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

    if (failed) {
      void notify(
        "Backup failed",
        `Backup failed on ${device.name}`,
        "WARNING"
      );
    }
  }

  // Store inventory / Windows-update reports collected from the agent.
  const cmdName = command.command.trim();
  if (!failed && output && (cmdName === "inventory" || cmdName === "winupdates")) {
    try {
      const data = JSON.parse(output);
      const kind = cmdName === "inventory" ? "software" : "updates";
      await prisma.deviceReport.upsert({
        where: { deviceId_kind: { deviceId: device.id, kind } },
        create: { deviceId: device.id, kind, data },
        update: { data, collectedAt: new Date() },
      });
    } catch {}
  }

  // Feed agent-run HTTP monitor results back into their monitor.
  if (command.command.startsWith("httpcheck ")) {
    try {
      const reqJson = JSON.parse(command.command.slice("httpcheck ".length));
      if (reqJson.monitorId && output) {
        const r = JSON.parse(output);
        await applyCheckResult(
          reqJson.monitorId,
          {
            ok: !!r.ok,
            status: r.status ?? null,
            durationMs: r.durationMs ?? null,
            error: r.error ?? null,
          },
          "agent"
        );
      }
    } catch {}
  } else if (failed) {
    await createAlert({
      deviceId: device.id,
      type: "COMMAND_FAILED",
      severity: "WARNING",
      message: `Command failed on ${device.name}: ${command.command}`,
    });
  }

  return NextResponse.json({ ok: true });
}
