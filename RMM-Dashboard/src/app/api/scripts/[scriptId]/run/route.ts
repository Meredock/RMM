import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// Run a library script on a single device or every online device in a company.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await params;
  const { deviceId, companyId } = await req.json();

  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 });

  const encoded = Buffer.from(script.content, "utf8").toString("base64");
  const command = `runscript ${script.shell} ${encoded}`;

  let deviceIds: string[] = [];
  if (deviceId) {
    deviceIds = [deviceId];
  } else if (companyId) {
    const devices = await prisma.device.findMany({
      where: { companyId, isOnline: true },
      select: { id: true },
    });
    deviceIds = devices.map((d) => d.id);
  }

  if (deviceIds.length === 0) {
    return NextResponse.json({ error: "No target devices (online)" }, { status: 409 });
  }

  await prisma.command.createMany({ data: deviceIds.map((id) => ({ deviceId: id, command })) });
  await auditCurrentUser("script.run", script.name, `${deviceIds.length} device(s)`);

  return NextResponse.json({ dispatched: deviceIds.length });
}
