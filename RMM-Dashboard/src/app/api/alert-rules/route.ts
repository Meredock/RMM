import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";
import type { AlertType, AlertSeverity } from "@prisma/client";

const THRESHOLD_TYPES = ["HIGH_CPU", "HIGH_RAM", "HIGH_DISK"];

export async function GET() {
  const rules = await prisma.alertRule.findMany({
    orderBy: { createdAt: "desc" },
  });
  // Attach device names (rules are global when deviceId is null).
  const deviceIds = [...new Set(rules.map((r) => r.deviceId).filter(Boolean))] as string[];
  const devices = deviceIds.length
    ? await prisma.device.findMany({ where: { id: { in: deviceIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(devices.map((d) => [d.id, d.name]));
  return NextResponse.json(
    rules.map((r) => ({ ...r, deviceName: r.deviceId ? nameById.get(r.deviceId) ?? "(unknown)" : null }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const type = body.type as AlertType;
  if (!["HIGH_CPU", "HIGH_RAM", "HIGH_DISK", "DEVICE_OFFLINE", "COMMAND_FAILED"].includes(type)) {
    return NextResponse.json({ error: "invalid rule type" }, { status: 400 });
  }
  const needsThreshold = THRESHOLD_TYPES.includes(type);
  if (needsThreshold && (body.threshold == null || isNaN(Number(body.threshold)))) {
    return NextResponse.json({ error: "threshold is required for this rule type" }, { status: 400 });
  }

  const rule = await prisma.alertRule.create({
    data: {
      type,
      threshold: needsThreshold ? Number(body.threshold) : null,
      severity: (body.severity === "CRITICAL" ? "CRITICAL" : body.severity === "INFO" ? "INFO" : "WARNING") as AlertSeverity,
      deviceId: body.deviceId || null,
      isEnabled: body.isEnabled !== false,
    },
  });
  await auditCurrentUser("rule.create", type, needsThreshold ? `>= ${rule.threshold}%` : null);
  return NextResponse.json(rule, { status: 201 });
}
