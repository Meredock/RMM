import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const monitors = await prisma.httpMonitor.findMany({
    orderBy: { name: "asc" },
    include: { device: { select: { id: true, name: true } } },
  });
  return NextResponse.json(monitors);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, url } = body;
  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url.trim())) {
    return NextResponse.json({ error: "url must start with http:// or https://" }, { status: 400 });
  }

  const monitor = await prisma.httpMonitor.create({
    data: {
      name: name.trim(),
      url: url.trim(),
      expectedStatus: body.expectedStatus ? Number(body.expectedStatus) : null,
      timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : 5000,
      intervalMinutes: body.intervalMinutes ? Number(body.intervalMinutes) : 5,
      deviceId: body.deviceId || null,
    },
  });
  return NextResponse.json(monitor, { status: 201 });
}
