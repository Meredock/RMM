import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// Dispatch a command to every online device in a company.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { command } = await req.json();
  if (!command?.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const devices = await prisma.device.findMany({
    where: { companyId, isOnline: true },
    select: { id: true },
  });
  if (devices.length === 0) {
    return NextResponse.json({ error: "No online devices in this company" }, { status: 409 });
  }

  await prisma.command.createMany({
    data: devices.map((d) => ({ deviceId: d.id, command: command.trim() })),
  });
  await auditCurrentUser("company.command", company.name, `${devices.length} devices: ${command.trim().slice(0, 160)}`);

  return NextResponse.json({ dispatched: devices.length });
}
