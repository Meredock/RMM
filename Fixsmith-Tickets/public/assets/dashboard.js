const els = {
  metricTotal: document.getElementById("metricTotal"),
  metricActive: document.getElementById("metricActive"),
  metricReady: document.getElementById("metricReady"),
  metricCustomers: document.getElementById("metricCustomers"),
  metricInventory: document.getElementById("metricInventory"),
  metricLowStock: document.getElementById("metricLowStock"),
  statusBreakdown: document.getElementById("statusBreakdown"),
  refreshBtn: document.getElementById("dashboardRefreshBtn"),
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || "Request failed");
  }
  return json;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDashboard(dashboard) {
  els.metricTotal.textContent = dashboard.totals.tickets;
  els.metricActive.textContent = dashboard.totals.active;
  els.metricReady.textContent = dashboard.totals.readyForPickup;
  els.metricCustomers.textContent = dashboard.totals.customers;
  els.metricInventory.textContent = dashboard.totals.inventoryItems;
  els.metricLowStock.textContent = dashboard.totals.lowStock;
  els.statusBreakdown.innerHTML = dashboard.byStatus
    .map((item) => `<li><strong>${escapeHtml(item.status)}</strong>: ${item.count}</li>`)
    .join("");
}

async function loadDashboard() {
  const dashboard = await fetchJson("/api/dashboard");
  renderDashboard(dashboard);
}

els.refreshBtn.addEventListener("click", () => {
  void loadDashboard();
});

void loadDashboard();
