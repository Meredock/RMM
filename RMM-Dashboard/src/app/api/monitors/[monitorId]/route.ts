import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined && body.name.trim()) data.name = body.name.trim();
  if (body.url !== undefined && body.url.trim()) data.url = body.url.trim();
  if (body.enabled !== undefined) data.enabled = !!body.enabled;
  if (body.expectedStatus !== undefined)
    data.expectedStatus = body.expectedStatus ? Number(body.expectedStatus) : null;
  if (body.timeoutMs !== undefined) data.timeoutMs = Number(body.timeoutMs) || 5000;
  if (body.intervalMinutes !== undefined)
    data.intervalMinutes = Number(body.intervalMinutes) || 5;
  if (body.deviceId !== undefined) data.deviceId = body.deviceId || null;

  const monitor = await prisma.httpMonitor.update({ where: { id: monitorId }, data });
  return NextResponse.json(monitor);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  await prisma.httpMonitor.delete({ where: { id: monitorId } });
  return NextResponse.json({ ok: true });
}
