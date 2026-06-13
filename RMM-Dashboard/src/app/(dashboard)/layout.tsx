import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="flex min-h-screen">
      <Sidebar unresolved={unresolved} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
