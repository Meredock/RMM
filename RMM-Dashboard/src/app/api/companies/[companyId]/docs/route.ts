import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const docs = await prisma.companyDoc.findMany({
    where: { companyId },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(docs);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { title, content } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const doc = await prisma.companyDoc.create({
    data: { companyId, title: title.trim(), content: content ?? "" },
  });
  await auditCurrentUser("vault.doc.create", doc.title, null);
  return NextResponse.json(doc, { status: 201 });
}
