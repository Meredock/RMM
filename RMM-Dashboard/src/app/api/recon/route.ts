import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scanSite, normalizeDomain } from "@/lib/recon";
import { auditCurrentUser } from "@/lib/audit";

// Recon runs outbound DNS/HTTP, so give it room.
export const maxDuration = 60;

export async function GET() {
  const scans = await prisma.siteScan.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, domain: true, companyId: true, createdAt: true },
  });
  return NextResponse.json(scans);
}

export async function POST(req: NextRequest) {
  const { domain, companyId } = await req.json();
  if (!domain?.trim()) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }
  const clean = normalizeDomain(domain);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) {
    return NextResponse.json({ error: "enter a valid domain, e.g. example.com" }, { status: 400 });
  }

  const result = await scanSite(clean);
  const scan = await prisma.siteScan.create({
    data: { domain: clean, companyId: companyId || null, result: result as unknown as Prisma.InputJsonValue },
  });
  await auditCurrentUser("recon.scan", clean, null);
  return NextResponse.json({ id: scan.id, result }, { status: 201 });
}
