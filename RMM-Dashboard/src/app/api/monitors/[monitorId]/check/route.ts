import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runServerCheck, applyCheckResult } from "@/lib/http-monitor";

// Run an immediate check. Server monitors run inline; agent monitors dispatch
// an httpcheck command (the result arrives asynchronously).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await params;
  const monitor = await prisma.httpMonitor.findUnique({
    where: { id: monitorId },
    include: { device: { select: { id: true, isOnline: true } } },
  });
  if (!monitor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!monitor.deviceId) {
    const result = await runServerCheck(monitor.url, monitor.expectedStatus, monitor.timeoutMs);
    await applyCheckResult(monitor.id, result, "server");
    return NextResponse.json({ dispatched: false, result });
  }

  if (!monitor.device?.isOnline) {
    return NextResponse.json({ error: "agent is offline" }, { status: 409 });
  }

  const payload = JSON.stringify({
    monitorId: monitor.id,
    url: monitor.url,
    expectedStatus: monitor.expectedStatus ?? 0,
    timeoutMs: monitor.timeoutMs,
  });
  await prisma.command.create({
    data: { deviceId: monitor.deviceId, command: `httpcheck ${payload}` },
  });
  return NextResponse.json({ dispatched: true });
}
