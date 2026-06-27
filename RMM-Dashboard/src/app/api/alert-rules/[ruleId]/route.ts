import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.isEnabled !== undefined) data.isEnabled = !!body.isEnabled;
  if (body.threshold !== undefined) data.threshold = body.threshold == null ? null : Number(body.threshold);
  if (body.severity !== undefined)
    data.severity = body.severity === "CRITICAL" ? "CRITICAL" : body.severity === "INFO" ? "INFO" : "WARNING";

  const rule = await prisma.alertRule.update({ where: { id: ruleId }, data });
  return NextResponse.json(rule);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params;
  const rule = await prisma.alertRule.delete({ where: { id: ruleId } });
  await auditCurrentUser("rule.delete", rule.type, null);
  return NextResponse.json({ ok: true });
}
