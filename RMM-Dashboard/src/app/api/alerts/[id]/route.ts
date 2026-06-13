import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const alert = await prisma.alert.update({
    where: { id },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json(alert);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.alert.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
