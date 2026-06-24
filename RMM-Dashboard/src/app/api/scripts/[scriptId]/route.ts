import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name?.trim()) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.content?.trim()) data.content = body.content;
  if (body.shell !== undefined) data.shell = body.shell === "cmd" ? "cmd" : body.shell === "sh" ? "sh" : "powershell";

  const script = await prisma.script.update({ where: { id: scriptId }, data });
  await auditCurrentUser("script.update", script.name, null);
  return NextResponse.json(script);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await params;
  const script = await prisma.script.delete({ where: { id: scriptId } });
  await auditCurrentUser("script.delete", script.name, null);
  return NextResponse.json({ ok: true });
}
