import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { auditCurrentUser } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ credId: string }> }
) {
  const { credId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.title?.trim()) data.title = body.title.trim();
  if (body.username !== undefined) data.username = body.username?.trim() || null;
  if (body.url !== undefined) data.url = body.url?.trim() || null;
  if (body.category !== undefined) data.category = body.category?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  // Only re-encrypt when a new secret is supplied (empty string clears it).
  if (body.secret !== undefined) data.secretEnc = encryptSecret(body.secret);

  const cred = await prisma.credential.update({
    where: { id: credId },
    data,
    select: { id: true, title: true },
  });
  await auditCurrentUser("vault.credential.update", cred.title, Object.keys(data).join(","));
  return NextResponse.json(cred);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ credId: string }> }
) {
  const { credId } = await params;
  const cred = await prisma.credential.delete({ where: { id: credId }, select: { title: true } });
  await auditCurrentUser("vault.credential.delete", cred.title, null);
  return NextResponse.json({ ok: true });
}
