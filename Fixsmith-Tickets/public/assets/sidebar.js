// Renders the shared sidebar into <aside id="appSidebar"> on every page and
// highlights the active item from the URL. Single source of truth for the nav.

const svg = (paths) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";

const ICONS = {
  dashboard: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  tickets: svg('<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><path d="M14 6v12"/>'),
  customers: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  inventory: svg('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>'),
  reports: svg('<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="5" width="3" height="13" rx="0.5"/>'),
  invoices: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>'),
};

const WRENCH = svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.8-.7-.7-2.8Z"/>');

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
  { href: "/tickets", label: "Tickets", icon: ICONS.tickets },
  { href: "/customers", label: "Customers", icon: ICONS.customers },
  { href: "/inventory", label: "Inventory", icon: ICONS.inventory },
  { href: "/calendar", label: "Calendar", icon: ICONS.calendar },
  { href: "/reports", label: "Reports", icon: ICONS.reports },
  { href: "/invoices", label: "Invoices", icon: ICONS.invoices },
];

function render() {
  const el = document.getElementById("appSidebar");
  if (!el) return;

  const path = (location.pathname.replace(/\/+$/, "") || "/dashboard").toLowerCase();
  const isActive = (href) =>
    href === "/tickets" ? path === "/tickets" || path.startsWith("/ticket") : path === href;

  const links = NAV.map(
    (n) =>
      '<a class="side-link' + (isActive(n.href) ? " active" : "") + '" href="' +
      n.href + '">' + n.icon + "<span>" + n.label + "</span></a>"
  ).join("");

  el.innerHTML =
    '<a class="brand" href="/dashboard">' + WRENCH +
    '<span class="brand-text"><strong>Fixsmith</strong><small>Repair Centre</small></span></a>' +
    '<nav class="side-nav">' + links + "</nav>";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render);
} else {
  render();
}
