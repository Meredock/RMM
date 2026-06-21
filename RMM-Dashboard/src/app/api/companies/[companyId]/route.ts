import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const company = await prisma.company.update({
    where: { id: companyId },
    data: { name: name.trim() },
  });
  return NextResponse.json(company);
}

// Deleting a company unassigns its devices (FK is ON DELETE SET NULL); the
// devices themselves are kept.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  await prisma.company.delete({ where: { id: companyId } });
  return NextResponse.json({ ok: true });
}
