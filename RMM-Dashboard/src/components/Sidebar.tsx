"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Monitor,
  LayoutDashboard,
  Server,
  Bell,
  Archive,
  Building2,
  Activity,
  Users,
  ScrollText,
  FileCode,
  KeyRound,
  Radar,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: Server },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/monitoring", label: "Monitoring", icon: Activity },
  { href: "/scripts", label: "Scripts", icon: FileCode },
  { href: "/vault", label: "Vault", icon: KeyRound },
  { href: "/security", label: "Web Security", icon: Radar },
  { href: "/backups", label: "Backup", icon: Archive },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

const adminNavItems = [
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

interface SidebarProps {
  unresolved?: number;
  username?: string;
  role?: "ADMIN" | "TECH";
}

export function Sidebar({ unresolved = 0, username, role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="p-1.5 rounded-md bg-primary/10">
          <Monitor className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">Fixsmith RMM</p>
          <p className="text-xs text-muted-foreground">Remote Management</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {[...navItems, ...(role === "ADMIN" ? adminNavItems : [])].map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors group",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {label === "Alerts" && unresolved > 0 && (
                <span className="text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {unresolved}
                </span>
              )}
              {active && <ChevronRight className="h-3 w-3 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-border">
        {username && (
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            Signed in as <span className="text-foreground font-medium">{username}</span>
            {role && <span className="ml-1 uppercase text-[10px] tracking-wider">({role})</span>}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
