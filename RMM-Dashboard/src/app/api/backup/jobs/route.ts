import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");

  const jobs = await prisma.backupJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      schedules: deviceId
        ? { where: { deviceId }, include: { device: { select: { id: true, name: true } } } }
        : { include: { device: { select: { id: true, name: true } } } },
      _count: { select: { runs: true } },
    },
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const { name, sources, exclude, destination, maxBytes } = await req.json();
  if (!name?.trim() || !Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json({ error: "name and sources are required" }, { status: 400 });
  }

  const job = await prisma.backupJob.create({
    data: {
      name: name.trim(),
      sources,
      exclude: exclude ?? [],
      destination: destination?.trim() || null,
      maxBytes: maxBytes ?? null,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
