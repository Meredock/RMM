import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  const runs = await prisma.backupRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      job: { select: { id: true, name: true, storageType: true } },
      device: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(runs);
}
