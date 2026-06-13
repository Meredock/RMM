"use client";

import { useState } from "react";
import { Monitor, Ticket, LogOut, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";

const APPS = [
  {
    title: "RMM Dashboard",
    description: "Remote monitoring & management for all your devices",
    icon: Monitor,
    href: "https://dashboard.fixsmith.com.au",
    color: "from-blue-600/20 to-blue-500/10 border-blue-500/30 hover:border-blue-400/60",
    iconColor: "text-blue-400",
    badge: "Live",
  },
  {
    title: "Fixsmith Tickets",
    description: "Repairs, invoicing, inventory & customer management",
    icon: Ticket,
    href: "https://tickets.fixsmith.com.au",
    color: "from-orange-600/20 to-orange-500/10 border-orange-500/30 hover:border-orange-400/60",
    iconColor: "text-orange-400",
    badge: "Coming soon",
  },
];

export default function PortalPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Fixsmith Suite</h1>
            <p className="text-xs text-muted-foreground">Choose an application</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </header>

      {/* Cards */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <p className="text-center text-muted-foreground text-sm mb-8">
            Select an application to continue
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {APPS.map((app) => {
              const Icon = app.icon;
              const isComingSoon = app.badge === "Coming soon";
              return (
                <a
                  key={app.title}
                  href={isComingSoon ? undefined : app.href}
                  onClick={isComingSoon ? (e) => e.preventDefault() : undefined}
                  className={`
                    relative flex flex-col gap-4 p-6 rounded-xl border bg-gradient-to-br
                    ${app.color} transition-all duration-200
                    ${isComingSoon ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:scale-[1.02] hover:shadow-lg"}
                  `}
                >
                  <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-background/60 text-muted-foreground border border-border">
                    {app.badge}
                  </span>
                  <div className={`p-3 rounded-lg bg-background/30 w-fit ${app.iconColor}`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground mb-1">{app.title}</h2>
                    <p className="text-sm text-muted-foreground leading-snug">{app.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
