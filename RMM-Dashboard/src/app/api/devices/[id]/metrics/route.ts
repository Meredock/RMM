import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subHours } from "date-fns";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const hours = Number(searchParams.get("hours") ?? "24");

  const metrics = await prisma.metric.findMany({
    where: {
      deviceId: id,
      timestamp: { gte: subHours(new Date(), Math.min(hours, 168)) },
    },
    orderBy: { timestamp: "asc" },
    select: {
      timestamp: true,
      cpuPercent: true,
      ramPercent: true,
      diskPercent: true,
      ramUsedMb: true,
      ramTotalMb: true,
      diskUsedGb: true,
      diskTotalGb: true,
    },
  });

  return NextResponse.json(metrics);
}
