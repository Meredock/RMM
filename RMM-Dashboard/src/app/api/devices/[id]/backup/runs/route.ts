import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const runs = await prisma.backupRun.findMany({
    where: { deviceId: id },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      job: { select: { id: true, name: true } },
      schedule: { select: { id: true, intervalMinutes: true } },
    },
  });

  return NextResponse.json(runs);
}
