import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params;
  const { enabled, intervalMinutes } = await req.json();

  const data: Record<string, unknown> = {};
  if (enabled !== undefined) data.enabled = enabled;
  if (intervalMinutes !== undefined) {
    data.intervalMinutes = intervalMinutes;
    data.nextRunAt = new Date(Date.now() + intervalMinutes * 60_000);
  }

  const schedule = await prisma.backupSchedule.update({
    where: { id: scheduleId },
    data,
  });

  return NextResponse.json(schedule);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params;
  await prisma.backupSchedule.delete({ where: { id: scheduleId } });
  return NextResponse.json({ ok: true });
}
