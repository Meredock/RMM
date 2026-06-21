import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await prisma.backupJob.findUnique({
    where: { id: jobId },
    include: { schedules: { include: { device: { select: { id: true, name: true } } } } },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json();
  const { name, sources, exclude, destination, maxBytes } = body;

  const data: Record<string, unknown> = {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(sources !== undefined && { sources }),
    ...(exclude !== undefined && { exclude }),
    ...(maxBytes !== undefined && { maxBytes: maxBytes ?? null }),
  };

  // Storage is only touched when storageType is supplied, so partial edits
  // (e.g. just renaming) leave the existing storage config alone.
  if (body.storageType !== undefined) {
    const storageType = body.storageType === "S3" ? "S3" : "LOCAL";
    if (storageType === "S3") {
      if (!body.s3Bucket?.trim()) {
        return NextResponse.json({ error: "s3Bucket is required for S3 storage" }, { status: 400 });
      }
      if (!body.s3Region?.trim() && !process.env.AWS_REGION) {
        return NextResponse.json(
          { error: "s3Region is required (or set AWS_REGION on the server)" },
          { status: 400 }
        );
      }
      data.storageType = "S3";
      data.destination = null;
      data.s3Bucket = body.s3Bucket.trim();
      data.s3Prefix = body.s3Prefix?.trim() || null;
      data.s3Region = body.s3Region?.trim() || null;
      data.s3Endpoint = body.s3Endpoint?.trim() || null;
    } else {
      data.storageType = "LOCAL";
      data.destination = destination?.trim() || null;
      data.s3Bucket = null;
      data.s3Prefix = null;
      data.s3Region = null;
      data.s3Endpoint = null;
    }
  } else if (destination !== undefined) {
    data.destination = destination?.trim() || null;
  }

  const job = await prisma.backupJob.update({ where: { id: jobId }, data });
  return NextResponse.json(job);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  await prisma.backupJob.delete({ where: { id: jobId } });
  return NextResponse.json({ ok: true });
}
