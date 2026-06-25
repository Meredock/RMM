import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

export async function GET() {
  const scripts = await prisma.script.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(scripts);
}

export async function POST(req: NextRequest) {
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
