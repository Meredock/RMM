import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// Dispatch a winget import (app install) of the supplied manifest to a target
// device. The manifest is base64-encoded into the command to survive transport.
export async function POST(req: NextRequest) {
  const { targetDeviceId, manifest, count } = await req.json();
  if (!targetDeviceId || !manifest) {
    return NextResponse.json({ error: "targetDeviceId and manifest are required" }, { status: 400 });
  }

  const device = await prisma.device.findUnique({ where: { id: targetDeviceId } });
  if (!device) return NextResponse.json({ error: "Target device not found" }, { status: 404 });
  if (!device.isOnline) return NextResponse.json({ error: "Target device is offline" }, { status: 409 });

  const encoded = Buffer.from(JSON.stringify(manifest), "utf8").toString("base64");
  await prisma.command.create({
    data: { deviceId: targetDeviceId, command: `appimport ${encoded}` },
  });
  await auditCurrentUser("apps.deploy", device.name, `${count ?? "?"} apps`);

  return NextResponse.json({ ok: true });
}
