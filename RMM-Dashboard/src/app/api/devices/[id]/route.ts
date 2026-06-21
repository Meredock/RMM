import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const device = await prisma.device.findUnique({
    where: { id },
    include: {
      metrics: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });

  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(device);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.companyId !== undefined) data.companyId = body.companyId || null;
  if (body.name !== undefined && body.name.trim()) data.name = body.name.trim();

  const device = await prisma.device.update({ where: { id }, data });
  return NextResponse.json(device);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
