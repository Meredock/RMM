import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { auditCurrentUser } from "@/lib/audit";

// List a company's credentials WITHOUT the secret (metadata only). Secrets are
// only ever returned via the audited reveal endpoint.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const creds = await prisma.credential.findMany({
    where: { companyId },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    select: {
      id: true, title: true, username: true, url: true,
      category: true, notes: true, updatedAt: true,
    },
  });
  return NextResponse.json(creds);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { title, username, secret, url, category, notes } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const cred = await prisma.credential.create({
    data: {
      companyId,
      title: title.trim(),
      username: username?.trim() || null,
      secretEnc: encryptSecret(secret ?? ""),
      url: url?.trim() || null,
      category: category?.trim() || null,
      notes: notes?.trim() || null,
    },
    select: { id: true, title: true },
  });
  await auditCurrentUser("vault.credential.create", cred.title, null);
  return NextResponse.json(cred, { status: 201 });
}
