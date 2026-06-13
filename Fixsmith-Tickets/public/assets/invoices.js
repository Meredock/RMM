const els = {
  ticketSelect: document.getElementById("invoiceTicketSelect"),
  labourRate: document.getElementById("invoiceLabourRate"),
  inventorySelect: document.getElementById("invoiceInventorySelect"),
  inventoryQty: document.getElementById("invoiceInventoryQty"),
  addPartBtn: document.getElementById("invoiceAddPartBtn"),
  generateBtn: document.getElementById("invoiceGenerateBtn"),
  printBtn: document.getElementById("invoicePrintBtn"),
  message: document.getElementById("invoiceMessage"),
  invoiceNumber: document.getElementById("invoiceNumber"),
  invoiceIssuedAt: document.getElementById("invoiceIssuedAt"),
  invoiceTicketId: document.getElementById("invoiceTicketId"),
  invoiceCustomer: document.getElementById("invoiceCustomer"),
  invoiceStatus: document.getElementById("invoiceStatus"),
  invoiceDevice: document.getElementById("invoiceDevice"),
  invoiceIssue: document.getElementById("invoiceIssue"),
  invoiceWorkSummary: document.getElementById("invoiceWorkSummary"),
  invoiceLabourRows: document.getElementById("invoiceLabourRows"),
  invoicePartsRows: document.getElementById("invoicePartsRows"),
  invoiceTotalHours: document.getElementById("invoiceTotalHours"),
  invoiceLabourCharge: document.getElementById("invoiceLabourCharge"),
  invoicePartsValue: document.getElementById("invoicePartsValue"),
  invoiceGrandTotal: document.getElementById("invoiceGrandTotal"),
};

const state = {
  tickets: [],
  inventory: [],
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

function money(value) {
  return Number(value).toFixed(2);
}

function formatDateTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
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

function selectedInventoryItem() {
  const id = els.inventorySelect.value;
  return state.inventory.find((item) => item.id === id);
}

function selectedTicket() {
  const id = els.ticketSelect.value;
  return state.tickets.find((ticket) => ticket.id === id);
}

function populateTickets() {
  if (!state.tickets.length) {
    els.ticketSelect.innerHTML = '<option value="">No tickets available</option>';
    return;
  }

  els.ticketSelect.innerHTML = state.tickets
    .map((ticket) => {
      const customer = ticket.customer?.organizationName || "Unknown customer";
      return `<option value="${ticket.id}">${escapeHtml(customer)} | ${escapeHtml(ticket.brand)} ${escapeHtml(ticket.model)} | Due ${escapeHtml(ticket.dueDate || "-")}</option>`;
    })
    .join("");

  const queryTicketId = new URLSearchParams(window.location.search).get("ticketId");
  if (queryTicketId && state.tickets.some((ticket) => ticket.id === queryTicketId)) {
    els.ticketSelect.value = queryTicketId;
  }
}

function populateInventory() {
  if (!state.inventory.length) {
    els.inventorySelect.innerHTML = '<option value="">No inventory available</option>';
    return;
  }

  els.inventorySelect.innerHTML = state.inventory
    .map(
      (item) =>
        `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.sku)}) | ${item.quantity} in stock | $${money(item.unitCost)}</option>`
    )
    .join("");
}

function renderLabourRows(ticket) {
  const entries = Array.isArray(ticket.labourLogs) ? ticket.labourLogs : [];
  if (!entries.length) {
    els.invoiceLabourRows.innerHTML = '<tr><td colspan="4"><small>No labour entries logged.</small></td></tr>';
    return { totalMinutes: 0 };
  }

  let totalMinutes = 0;
  els.invoiceLabourRows.innerHTML = entries
    .map((entry) => {
      totalMinutes += Number(entry.minutes || 0);
      const hours = Number(entry.minutes || 0) / 60;
      return `
        <tr>
          <td>${escapeHtml(formatDateTime(entry.loggedAt || ""))}</td>
          <td>${Number(entry.minutes || 0)}</td>
          <td>${hours.toFixed(2)}</td>
          <td>${escapeHtml(entry.note || "")}</td>
        </tr>
      `;
    })
    .join("");

  return { totalMinutes };
}

function renderPartsRows(ticket) {
  const entries = Array.isArray(ticket.partsUsed) ? ticket.partsUsed : [];
  if (!entries.length) {
    els.invoicePartsRows.innerHTML = '<tr><td colspan="5"><small>No parts added to this ticket.</small></td></tr>';
    return { partsSubtotal: 0 };
  }

  let partsSubtotal = 0;
  els.invoicePartsRows.innerHTML = entries
    .map((entry) => {
      const lineTotal = Number(entry.quantity || 0) * Number(entry.unitCost || 0);
      partsSubtotal += lineTotal;
      return `
        <tr>
          <td>${escapeHtml(entry.name)}<br /><small>${escapeHtml(entry.sku)}</small></td>
          <td>${entry.quantity}</td>
          <td>$${money(entry.unitCost)}</td>
          <td>$${money(lineTotal)}</td>
          <td><button type="button" class="danger" data-action="remove-part" data-part-id="${entry.id}">Remove</button></td>
        </tr>
      `;
    })
    .join("");

  return { partsSubtotal };
}

function renderInvoice() {
  const ticket = selectedTicket();
  if (!ticket) {
    setMessage("Please select a ticket.", "error");
    return;
  }

  const labourRate = Number(els.labourRate.value || 0);
  const { totalMinutes } = renderLabourRows(ticket);
  const { partsSubtotal } = renderPartsRows(ticket);
  const totalHours = totalMinutes / 60;
  const labourCharge = totalHours * labourRate;
  const grandTotal = labourCharge + partsSubtotal;

  els.invoiceNumber.textContent = `Invoice #: INV-${ticket.id.slice(0, 8).toUpperCase()}`;
  els.invoiceIssuedAt.textContent = `Issued: ${new Date().toLocaleString()}`;

  els.invoiceTicketId.textContent = ticket.id.slice(0, 8).toUpperCase();
  els.invoiceCustomer.textContent = ticket.customer?.organizationName || "Unknown customer";
  els.invoiceStatus.textContent = ticket.status;

  els.invoiceDevice.innerHTML = `<strong>Device:</strong> ${escapeHtml(ticket.brand)} ${escapeHtml(ticket.model)} (${escapeHtml(ticket.deviceType)})`;
  els.invoiceIssue.innerHTML = `<strong>Issue:</strong> ${escapeHtml(ticket.issue || "-")}`;
  els.invoiceWorkSummary.innerHTML = `<strong>Work Completed:</strong> ${escapeHtml(ticket.workCompletedSummary || "No work summary provided.")}`;

  els.invoiceTotalHours.textContent = totalHours.toFixed(2);
  els.invoiceLabourCharge.textContent = money(labourCharge);
  els.invoicePartsValue.textContent = money(partsSubtotal);
  els.invoiceGrandTotal.textContent = money(grandTotal);

  setMessage("Invoice generated.", "success");
}

async function loadData() {
  const [tickets, inventory] = await Promise.all([fetchJson("/api/tickets"), fetchJson("/api/inventory")]);
  state.tickets = tickets.data;
  state.inventory = inventory.data;
}

async function addPartToTicket() {
  const ticket = selectedTicket();
  const item = selectedInventoryItem();
  const quantity = Number(els.inventoryQty.value || 0);

  if (!ticket) {
    setMessage("Select a ticket first.", "error");
    return;
  }

  if (!item) {
    setMessage("Select an inventory item.", "error");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    setMessage("Quantity must be a whole number greater than 0.", "error");
    return;
  }

  try {
    await fetchJson(`/api/tickets/${ticket.id}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryItemId: item.id, quantity }),
    });

    await loadData();
    populateTickets();
    populateInventory();
    els.ticketSelect.value = ticket.id;
    renderInvoice();
    setMessage("Part added to ticket and costs updated.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function removePartFromTicket(partId) {
  const ticket = selectedTicket();
  if (!ticket) {
    return;
  }

  try {
    await fetchJson(`/api/tickets/${ticket.id}/parts/${partId}`, { method: "DELETE" });
    await loadData();
    populateTickets();
    populateInventory();
    els.ticketSelect.value = ticket.id;
    renderInvoice();
    setMessage("Part removed from ticket.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

els.generateBtn.addEventListener("click", renderInvoice);
els.ticketSelect.addEventListener("change", renderInvoice);
els.labourRate.addEventListener("input", renderInvoice);
els.addPartBtn.addEventListener("click", () => {
  void addPartToTicket();
});
els.printBtn.addEventListener("click", () => {
  window.print();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action === "remove-part" && target.dataset.partId) {
    void removePartFromTicket(target.dataset.partId);
  }
});

void (async () => {
  try {
    await loadData();
    populateTickets();
    populateInventory();
    renderInvoice();
  } catch (error) {
    setMessage(error.message, "error");
  }
})();
