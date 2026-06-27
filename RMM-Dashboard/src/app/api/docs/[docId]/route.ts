import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title?.trim()) data.title = body.title.trim();
  if (body.content !== undefined) data.content = body.content;

  const doc = await prisma.companyDoc.update({ where: { id: docId }, data });
  await auditCurrentUser("vault.doc.update", doc.title, null);
  return NextResponse.json(doc);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const doc = await prisma.companyDoc.delete({ where: { id: docId }, select: { title: true } });
  await auditCurrentUser("vault.doc.delete", doc.title, null);
  return NextResponse.json({ ok: true });
}
