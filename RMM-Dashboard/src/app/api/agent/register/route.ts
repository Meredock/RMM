import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, safeEqual } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { validateRegistrationPayload } from "@/lib/agent-validation";

export async function POST(req: NextRequest) {
  // Validate registration secret. In production it is mandatory: without it,
  // anyone who can reach this endpoint could enroll devices into the fleet.
  const registrationSecret = process.env.AGENT_REGISTRATION_SECRET;
  if (!registrationSecret && process.env.NODE_ENV === "production") {
    console.error("[register] AGENT_REGISTRATION_SECRET is not set; refusing agent registration");
    return NextResponse.json(
      { error: "Agent registration is disabled until the server's AGENT_REGISTRATION_SECRET is configured" },
      { status: 503 }
    );
  }
  if (registrationSecret) {
    const provided = req.headers.get("x-registration-secret") ?? "";
    if (!safeEqual(provided, registrationSecret)) {
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
    // A hostname alone is not sufficient authorization to re-enroll. Re-enrollment
    // is allowed only when the dashboard is protected by its registration secret.
    if (!registrationSecret) {
      return NextResponse.json({ error: "Device already registered. Use its saved API key to resume heartbeats." }, { status: 409 });
    }
    // Only the key's hash is stored, so the old key can't be handed back: issue a
    // new one. This also revokes the previous key.
    const apiKey = generateApiKey();
    await prisma.device.update({ where: { id: existing.id }, data: { apiKeyHash: hashApiKey(apiKey) } });
    await recordAudit(`agent:${existing.id}`, "agent.registration.rekeyed", existing.id, `hostname=${existing.hostname}`);
    return NextResponse.json(
      {
        message: "Device already registered; issued a new API key",
        deviceId: existing.id,
        apiKey,
      },
      { status: 200 }
    );
  }

  const apiKey = generateApiKey();

  const device = await prisma.device.create({
    data: {
      name: payload.name,
      hostname: payload.hostname,
      platform: payload.platform,
      deviceType: payload.deviceType,
      osVersion: payload.osVersion,
      ipAddress: payload.ipAddress,
      agentVersion: payload.agentVersion,
      apiKeyHash: hashApiKey(apiKey),
    },
  });

  await recordAudit(`agent:${device.id}`, "agent.registration.created", device.id, `type=${device.deviceType}; hostname=${device.hostname}`);

  return NextResponse.json(
    {
      message: "Device registered",
      deviceId: device.id,
      apiKey,
    },
    { status: 201 }
  );
}
