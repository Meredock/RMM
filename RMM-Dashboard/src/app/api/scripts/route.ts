import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { auditCurrentUser } from "@/lib/audit";

export async function GET() {
  const scripts = await prisma.script.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(scripts);
}

// Script library changes are admin only: a technician editing a script that an
// admin has scheduled would otherwise get their code run.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { name, description, shell, content } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }
  const script = await prisma.script.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      shell: shell === "cmd" ? "cmd" : shell === "sh" ? "sh" : "powershell",
      content,
    },
  });
  await auditCurrentUser("script.create", script.name, null);
  return NextResponse.json(script, { status: 201 });
}
