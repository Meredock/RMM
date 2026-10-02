import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { username: session.username },
    select: { username: true, role: true, totpEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ username: session.username, role: session.role, totpEnabled: false, bootstrap: true });
  }
  return NextResponse.json({ ...user, bootstrap: false });
}
