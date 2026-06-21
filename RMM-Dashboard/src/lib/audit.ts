import { prisma } from "./prisma";
import { getSessionUser } from "./auth";

// recordAudit writes an audit-trail entry. Failures are logged but never block
// the action being audited.
export async function recordAudit(
  actor: string,
  action: string,
  target: string | null,
  detail: string | null
) {
  try {
    await prisma.auditLog.create({ data: { actor, action, target, detail } });
  } catch (e) {
    console.error("[audit] failed to record:", e);
  }
}

// auditCurrentUser records an action attributed to the currently signed-in user
// (falling back to "unknown"). Convenience for API routes.
export async function auditCurrentUser(
  action: string,
  target: string | null,
  detail: string | null = null
) {
  const user = await getSessionUser();
  await recordAudit(user?.username ?? "unknown", action, target, detail);
}
