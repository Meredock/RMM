const statuses = ["new", "in progress", "waiting for parts", "waiting for customer", "customer has replied"];

const els = {
  preset: document.getElementById("reportPreset"),
  from: document.getElementById("reportFrom"),
  to: document.getElementById("reportTo"),
  completedOnly: document.getElementById("reportCompletedOnly"),
  runBtn: document.getElementById("reportRunBtn"),
  printBtn: document.getElementById("reportPrintBtn"),
  message: document.getElementById("reportMessage"),
  periodLabel: document.getElementById("reportPeriodLabel"),
  generatedAt: document.getElementById("reportGeneratedAt"),
  metricTotal: document.getElementById("reportMetricTotal"),
  metricCompleted: document.getElementById("reportMetricCompleted"),
  metricCustomers: document.getElementById("reportMetricCustomers"),
  statusBreakdown: document.getElementById("reportStatusBreakdown"),
  rows: document.getElementById("reportRows"),
};

const state = {
  tickets: [],
};

function setMessage(text = "", type = "") {
  els.message.textContent = text;
  els.message.className = type ? `message ${type}` : "message";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json();
  if (!response.ok) {
    const details = Array.isArray(json.details) ? `: ${json.details.join(", ")}` : "";
    throw new Error((json.error || "Request failed") + details);
  }
  return json;
}

function formatDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDateValue() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function shiftDateValue(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function applyPreset() {
  const preset = els.preset.value;
  if (preset === "last7") {
    els.from.value = shiftDateValue(7);
    els.to.value = todayDateValue();
    return;
  }

  if (preset === "last30") {
    els.from.value = shiftDateValue(30);
    els.to.value = todayDateValue();
    return;
  }

  if (preset === "thisMonth") {
    els.from.value = monthStartDateValue();
    els.to.value = todayDateValue();
  }
}

function inRange(value, from, to) {
  return value >= from && value <= to;
}

function filteredTickets() {
  const from = els.from.value;
  const to = els.to.value;
  const completedOnly = els.completedOnly.checked;

  return state.tickets.filter((ticket) => {
    const reportDate = ticket.dueDate || ticket.updatedAt?.slice(0, 10);
    if (!reportDate || !inRange(reportDate, from, to)) {
      return false;
    }

    if (completedOnly && ticket.status !== "customer has replied") {
      return false;
    }

    return true;
  });
}

function renderStatusBreakdown(tickets) {
  els.statusBreakdown.innerHTML = statuses
    .map((status) => {
      const count = tickets.filter((ticket) => ticket.status === status).length;
      return `<li><strong>${escapeHtml(status)}</strong>: ${count}</li>`;
    })
    .join("");
}

function renderRows(tickets) {
  if (!tickets.length) {
    els.rows.innerHTML = '<tr><td colspan="5"><small>No jobs found for this period.</small></td></tr>';
    return;
  }

  els.rows.innerHTML = tickets
    .slice()
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .map((ticket) => {
      const customerName = ticket.customer?.organizationName || "Unknown customer";
      return `
        <tr>
          <td>${escapeHtml(formatDateOnly(ticket.dueDate || ""))}</td>
          <td>${escapeHtml(customerName)}</td>
          <td>${escapeHtml(ticket.brand)} ${escapeHtml(ticket.model)}<br /><small>${escapeHtml(ticket.deviceType)}</small></td>
          <td>${escapeHtml(ticket.issue)}</td>
          <td><span class="status-cell">${escapeHtml(ticket.status)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderReport() {
  const from = els.from.value;
  const to = els.to.value;

  if (!from || !to) {
    setMessage("Please choose a valid date range.", "error");
    return;
  }

  if (from > to) {
    setMessage("From date cannot be after To date.", "error");
    return;
  }

  const tickets = filteredTickets();
  const completedCount = tickets.filter((ticket) => ticket.status === "customer has replied").length;
  const uniqueCustomers = new Set(tickets.map((ticket) => ticket.customerId)).size;

  els.periodLabel.textContent = `Period: ${formatDateOnly(from)} to ${formatDateOnly(to)}`;
  els.generatedAt.textContent = `Generated: ${new Date().toLocaleString()}`;

  els.metricTotal.textContent = String(tickets.length);
  els.metricCompleted.textContent = String(completedCount);
  els.metricCustomers.textContent = String(uniqueCustomers);

  renderStatusBreakdown(tickets);
  renderRows(tickets);
  setMessage(`Compiled ${tickets.length} job(s) for the selected period.`, "success");
}

async function loadData() {
  const tickets = await fetchJson("/api/tickets");
  state.tickets = tickets.data;
}

els.preset.addEventListener("change", () => {
  if (els.preset.value !== "custom") {
    applyPreset();
  }
});

els.runBtn.addEventListener("click", () => {
  renderReport();
});

els.printBtn.addEventListener("click", () => {
  window.print();
});

applyPreset();
void (async () => {
  try {
    await loadData();
    renderReport();
  } catch (error) {
    setMessage(error.message, "error");
  }
})();
