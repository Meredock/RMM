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
  const body = await req.json();
  const { name, sources, exclude, destination, maxBytes } = body;
  if (!name?.trim() || !Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json({ error: "name and sources are required" }, { status: 400 });
  }

  const storageType = body.storageType === "S3" ? "S3" : "LOCAL";

  if (storageType === "S3") {
    if (!body.s3Bucket?.trim()) {
      return NextResponse.json(
        { error: "s3Bucket is required for S3 storage" },
        { status: 400 }
      );
    }
    if (!body.s3Region?.trim() && !process.env.AWS_REGION) {
      return NextResponse.json(
        { error: "s3Region is required (or set AWS_REGION on the server)" },
        { status: 400 }
      );
    }
  }

  const job = await prisma.backupJob.create({
    data: {
      name: name.trim(),
      sources,
      exclude: exclude ?? [],
      destination: storageType === "LOCAL" ? destination?.trim() || null : null,
      maxBytes: maxBytes ?? null,
      storageType,
      s3Bucket: storageType === "S3" ? body.s3Bucket.trim() : null,
      s3Prefix: storageType === "S3" ? body.s3Prefix?.trim() || null : null,
      s3Region: storageType === "S3" ? body.s3Region?.trim() || null : null,
      s3Endpoint: storageType === "S3" ? body.s3Endpoint?.trim() || null : null,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
