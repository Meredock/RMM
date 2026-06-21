import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";

// requireAdmin returns a 403 response if the current user is not an admin, or
// null if they are. Use: `const denied = await requireAdmin(); if (denied) return denied;`
export async function requireAdmin(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
