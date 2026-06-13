import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const schedules = await prisma.backupSchedule.findMany({
    where: { jobId },
    include: { device: { select: { id: true, name: true } } },
  });
  return NextResponse.json(schedules);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { deviceId, intervalMinutes } = await req.json();

  if (!deviceId || !intervalMinutes || intervalMinutes < 1) {
    return NextResponse.json(
      { error: "deviceId and intervalMinutes (≥1) are required" },
      { status: 400 }
    );
  }

  const job = await prisma.backupJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const existing = await prisma.backupSchedule.findFirst({ where: { jobId, deviceId } });
  if (existing) {
    return NextResponse.json({ error: "Schedule already exists for this device" }, { status: 409 });
  }

  const nextRunAt = new Date(Date.now() + intervalMinutes * 60_000);
  const schedule = await prisma.backupSchedule.create({
    data: { jobId, deviceId, intervalMinutes, nextRunAt },
    include: { device: { select: { id: true, name: true } } },
  });

  return NextResponse.json(schedule, { status: 201 });
}
