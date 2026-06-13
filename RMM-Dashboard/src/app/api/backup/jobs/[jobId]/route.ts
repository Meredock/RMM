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
  const { name, sources, exclude, destination, maxBytes } = await req.json();

  const job = await prisma.backupJob.update({
    where: { id: jobId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(sources !== undefined && { sources }),
      ...(exclude !== undefined && { exclude }),
      destination: destination?.trim() || null,
      maxBytes: maxBytes ?? null,
    },
  });

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
