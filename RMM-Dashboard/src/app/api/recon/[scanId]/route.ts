import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const scan = await prisma.siteScan.findUnique({ where: { id: scanId } });
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(scan);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const scan = await prisma.siteScan.delete({ where: { id: scanId } });
  await auditCurrentUser("recon.delete", scan.domain, null);
  return NextResponse.json({ ok: true });
}
