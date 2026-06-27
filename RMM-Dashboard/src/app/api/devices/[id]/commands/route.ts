import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const commands = await prisma.command.findMany({
    where: { deviceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(commands);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const { command } = await req.json();
  if (!command?.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const cmd = await prisma.command.create({
    data: { deviceId: id, command: command.trim() },
  });

  const c = command.trim();
  const action = c.startsWith("avscan")
    ? "device.scan"
    : c === "installupdates"
      ? "device.patch"
      : c.startsWith("shutdown /r")
        ? "device.reboot"
        : c.startsWith("shutdown /s")
          ? "device.shutdown"
          : c === "restart-agent"
            ? "device.agent_restart"
            : c === "update-agent"
              ? "device.agent_update"
              : "device.command";
  await auditCurrentUser(action, device.name, c.slice(0, 200));

  return NextResponse.json(cmd, { status: 201 });
}
