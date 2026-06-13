import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // Validate registration secret
  const registrationSecret = process.env.AGENT_REGISTRATION_SECRET;
  if (registrationSecret) {
    const provided = req.headers.get("x-registration-secret");
    if (provided !== registrationSecret) {
      return NextResponse.json({ error: "Invalid registration secret" }, { status: 401 });
    }
  }

  const body = await req.json();
  const { name, hostname, platform, osVersion, ipAddress, agentVersion } = body;

  if (!name || !hostname) {
    return NextResponse.json({ error: "name and hostname are required" }, { status: 400 });
  }

  // Check if device with this hostname already exists
  const existing = await prisma.device.findFirst({ where: { hostname } });
  if (existing) {
    return NextResponse.json(
      {
        message: "Device already registered",
        deviceId: existing.id,
        apiKey: existing.apiKey,
      },
      { status: 200 }
    );
  }

  const device = await prisma.device.create({
    data: {
      name,
      hostname,
      platform: platform ?? "unknown",
      osVersion,
      ipAddress,
      agentVersion,
      apiKey: generateApiKey(),
    },
  });

  return NextResponse.json(
    {
      message: "Device registered",
      deviceId: device.id,
      apiKey: device.apiKey,
    },
    { status: 201 }
  );
}
