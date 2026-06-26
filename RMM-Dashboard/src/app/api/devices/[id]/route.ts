import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

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
  if (body.notes !== undefined) data.notes = body.notes || null;

  const device = await prisma.device.update({ where: { id }, data });
  return NextResponse.json(device);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const device = await prisma.device.delete({ where: { id } });
  await auditCurrentUser("device.delete", device.name, null);
  return NextResponse.json({ ok: true });
}
