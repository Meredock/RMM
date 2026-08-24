import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { validateRegistrationPayload } from "@/lib/agent-validation";

export async function POST(req: NextRequest) {
  // Validate registration secret
  const registrationSecret = process.env.AGENT_REGISTRATION_SECRET;
  if (registrationSecret) {
    const provided = req.headers.get("x-registration-secret");
    if (provided !== registrationSecret) {
      return NextResponse.json({ error: "Invalid registration secret" }, { status: 401 });
    }
  }

  let payload: ReturnType<typeof validateRegistrationPayload>;
  try {
    payload = validateRegistrationPayload(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid registration request" }, { status: 400 });
  }

  // Check if device with this hostname already exists
  const existing = await prisma.device.findFirst({ where: { hostname: payload.hostname } });
  if (existing) {
    // A hostname alone is not sufficient authorization to recover an agent key.
    // Re-enrollment can recover it only when the dashboard is protected by its
    // registration secret; otherwise, retain the securely stored key on device.
    if (!registrationSecret) {
      return NextResponse.json({ error: "Device already registered. Use its saved API key to resume heartbeats." }, { status: 409 });
    }
    await recordAudit(`agent:${existing.id}`, "agent.registration.reused", existing.id, `hostname=${existing.hostname}`);
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
      name: payload.name,
      hostname: payload.hostname,
      platform: payload.platform,
      deviceType: payload.deviceType,
      osVersion: payload.osVersion,
      ipAddress: payload.ipAddress,
      agentVersion: payload.agentVersion,
      apiKey: generateApiKey(),
    },
  });

  await recordAudit(`agent:${device.id}`, "agent.registration.created", device.id, `type=${device.deviceType}; hostname=${device.hostname}`);

  return NextResponse.json(
    {
      message: "Device registered",
      deviceId: device.id,
      apiKey: device.apiKey,
    },
    { status: 201 }
  );
}
