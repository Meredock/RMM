import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

async function getUnresolvedAlertCount() {
  try {
    return await prisma.alert.count({ where: { isResolved: false } });
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const unresolved = await getUnresolvedAlertCount();
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar unresolved={unresolved} username={user?.username} role={user?.role} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
