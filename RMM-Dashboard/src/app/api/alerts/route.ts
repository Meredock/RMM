import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const resolvedParam = searchParams.get("resolved");

  const where =
    resolvedParam === "false"
      ? { isResolved: false }
      : resolvedParam === "true"
      ? { isResolved: true }
      : {};

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: [{ isResolved: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      device: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(alerts);
}
