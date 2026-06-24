import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const reports = await prisma.deviceReport.findMany({ where: { deviceId: id } });
  const byKind: Record<string, { data: unknown; collectedAt: string }> = {};
  for (const r of reports) {
    byKind[r.kind] = { data: r.data, collectedAt: r.collectedAt.toISOString() };
  }
  return NextResponse.json(byKind);
}
