import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const archiveName = `${job.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-${new Date().toISOString().slice(0, 10)}`;
  const payload = JSON.stringify({
    sources: job.sources,
    exclude: job.exclude.length > 0 ? job.exclude : undefined,
    destination: job.destination || undefined,
    maxBytes: job.maxBytes || undefined,
    name: archiveName,
  });

  const command = await prisma.command.create({
    data: { deviceId, command: `backup ${payload}` },
  });

  const run = await prisma.backupRun.create({
    data: { jobId, deviceId, commandId: command.id, status: "PENDING" },
  });

  return NextResponse.json(run, { status: 201 });
}
