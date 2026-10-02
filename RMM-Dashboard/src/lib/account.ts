import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getSessionUser } from "./auth";

// requireAccount loads the signed-in user's database row. Bootstrap sessions
// (DASHBOARD_PASSWORD) have no row, so account settings aren't available to them.
export async function requireAccount() {
  const session = await getSessionUser();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  const user = await prisma.user.findUnique({ where: { username: session.username } });
  if (!user) {
    return {
      error: NextResponse.json({ error: "Sign in with a user account to change account settings" }, { status: 400 }),
    } as const;
  }
  return { user } as const;
}
