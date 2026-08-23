import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function cleanDays(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<number>();
  for (const d of input) {
    const n = Math.floor(Number(d));
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

// GET /api/maintenance-windows — all windows.
export async function GET() {
  const windows = await prisma.maintenanceWindow.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(windows);
}

// POST /api/maintenance-windows — create a window.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const daysOfWeek = cleanDays(b.daysOfWeek);
  const startMinute = Math.floor(Number(b.startMinute));
  const endMinute = Math.floor(Number(b.endMinute));
  const timezone = String(b.timezone ?? "UTC").trim() || "UTC";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (daysOfWeek.length === 0) return NextResponse.json({ error: "pick at least one day" }, { status: 400 });
  for (const [label, m] of [["startMinute", startMinute], ["endMinute", endMinute]] as const) {
    if (!Number.isInteger(m) || m < 0 || m > 1439) {
      return NextResponse.json({ error: `${label} must be between 0 and 1439` }, { status: 400 });
    }
  }
  if (startMinute >= endMinute) {
    return NextResponse.json({ error: "start must be before end (overnight windows not supported yet)" }, { status: 400 });
  }
  if (!validTimezone(timezone)) {
    return NextResponse.json({ error: "invalid timezone" }, { status: 400 });
  }

  const win = await prisma.maintenanceWindow.create({
    data: { name, daysOfWeek, startMinute, endMinute, timezone, enabled: b.enabled !== false },
  });
  await auditCurrentUser("maintenance_window.create", win.name, null);
  return NextResponse.json(win, { status: 201 });
}
