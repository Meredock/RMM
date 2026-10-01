import { NextRequest, NextResponse } from "next/server";
import { traderFetch } from "@/lib/trader";
import { requireAdmin } from "@/lib/guard";
import { auditCurrentUser } from "@/lib/audit";

// Proxy to the internal RMM-Trader service. Reads are open to any signed-in user;
// anything that changes behaviour is admin-only and audited.

const READS: Record<string, (req: NextRequest) => string> = {
  status: () => "/status",
  journal: (req) => `/journal?limit=${Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100}`,
};

const WRITES: Record<string, { method: string; path: string }> = {
  run: { method: "POST", path: "/run" },
  pause: { method: "POST", path: "/pause" },
  resume: { method: "POST", path: "/resume" },
  settings: { method: "PUT", path: "/settings" },
};

type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { action } = await params;
  const path = READS[action]?.(req);
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { status, data } = await traderFetch(path);
  return NextResponse.json(data, { status });
}

async function write(req: NextRequest, { params }: Ctx, method: string) {
  const { action } = await params;
  const target = WRITES[action];
  if (!target || target.method !== method) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = method === "PUT" ? await req.json().catch(() => null) : undefined;
  const { status, data } = await traderFetch(target.path, { method, body });
  if (status < 300) {
    await auditCurrentUser(`trader.${action}`, "trader", body ? JSON.stringify(body).slice(0, 500) : null);
  }
  return NextResponse.json(data, { status });
}

export function POST(req: NextRequest, ctx: Ctx) {
  return write(req, ctx, "POST");
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return write(req, ctx, "PUT");
}
