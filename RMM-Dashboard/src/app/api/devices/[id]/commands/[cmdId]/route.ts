import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cmdId: string }> }
) {
  const { id, cmdId } = await params;
  const command = await prisma.command.findUnique({ where: { id: cmdId } });

  if (!command || command.deviceId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(command);
}
