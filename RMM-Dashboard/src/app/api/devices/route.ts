import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const devices = await prisma.device.findMany({
    orderBy: [{ isOnline: "desc" }, { name: "asc" }],
    include: {
      metrics: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
      _count: {
        select: { alerts: { where: { isResolved: false } } },
      },
    },
  });

  return NextResponse.json(devices);
}
