import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Reports whether the caller's session cookie is still valid, using the same
// database-backed check as every dashboard request (deleted users, role or
// password changes and bootstrap expiry all revoke it). Fixsmith Tickets calls
// this so a session revoked here stops working there too.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ username: user.username, role: user.role });
}
