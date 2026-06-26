import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const fields = await prisma.deviceField.findMany({
    where: { deviceId: id },
    orderBy: { key: "asc" },
  });
  return NextResponse.json(fields);
}

// Upsert a custom field (by key) on the device.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { key, value } = await req.json();
  if (!key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  const field = await prisma.deviceField.upsert({
    where: { deviceId_key: { deviceId: id, key: key.trim() } },
    create: { deviceId: id, key: key.trim(), value: value ?? "" },
    update: { value: value ?? "" },
  });
  return NextResponse.json(field, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  await prisma.deviceField.deleteMany({ where: { deviceId: id, key } });
  return NextResponse.json({ ok: true });
}
