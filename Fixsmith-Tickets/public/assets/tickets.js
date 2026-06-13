const statuses = ["new", "in progress", "waiting for parts", "waiting for customer", "customer has replied"];

const state = {
  customers: [],
  tickets: [],
  selectedTicketId: null,
  draftLabourEntries: [],
};

const els = {
  refreshBtn: document.getElementById("ticketsRefreshBtn"),
  ticketForm: document.getElementById("ticketForm"),
  ticketFormTitle: document.getElementById("ticketFormTitle"),
  ticketSubmitBtn: document.getElementById("ticketSubmitBtn"),
  ticketCancelBtn: document.getElementById("ticketCancelBtn"),
  ticketMessage: document.getElementById("ticketMessage"),
  ticketCustomerSelect: document.getElementById("ticketCustomerSelect"),
  ticketStatusSelect: document.getElementById("ticketStatusSelect"),
  ticketCorrespondenceEmail: document.getElementById("ticketCorrespondenceEmail"),
  ticketRows: document.getElementById("ticketRows"),
  ticketLabourMinutes: document.getElementById("ticketLabourMinutes"),
  ticketLabourLoggedAt: document.getElementById("ticketLabourLoggedAt"),
  ticketLabourAddBtn: document.getElementById("ticketLabourAddBtn"),
  ticketDraftLabourRows: document.getElementById("ticketDraftLabourRows"),
  labourForm: document.getElementById("labourForm"),
  labourSubmitBtn: document.getElementById("labourSubmitBtn"),
  labourMessage: document.getElementById("labourMessage"),
  labourRows: document.getElementById("labourRows"),
  labourTicketLabel: document.getElementById("labourTicketLabel"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMessage(element, text = "", type = "") {
  element.textContent = text;
  element.className = type ? `message ${type}` : "message";
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

function defaultDueDateValue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function defaultDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatLoggedAt(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function statusOptions(selected) {
  return statuses
    .map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`)
    .join("");
}

function populateTicketCustomerOptions() {
  const options = state.customers.length
    ? state.customers
        .map((customer) => `<option value="${customer.id}">${escapeHtml(customer.organizationName)} - ${escapeHtml(customer.contactName)}</option>`)
        .join("")
    : '<option value="">Create a customer first</option>';

  els.ticketCustomerSelect.innerHTML = options;
  els.ticketCustomerSelect.disabled = state.customers.length === 0;
}

function populateStatusOptions() {
  els.ticketStatusSelect.innerHTML = statusOptions("new");
}

function resetTicketLabourBuilder() {
  state.draftLabourEntries = [];
  els.ticketLabourMinutes.value = "";
  els.ticketLabourLoggedAt.value = defaultDateTimeValue();
  renderDraftLabourEntries();
}

function renderDraftLabourEntries() {
  if (!state.draftLabourEntries.length) {
    els.ticketDraftLabourRows.innerHTML = '<tr><td colspan="3"><small>No labour queued for this ticket yet.</small></td></tr>';
    return;
  }

  els.ticketDraftLabourRows.innerHTML = state.draftLabourEntries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(formatLoggedAt(entry.loggedAt))}</td>
          <td>${entry.minutes}</td>
          <td>
            <div class="inline-actions">
              <button type="button" class="ghost" data-entity="draft-labour" data-action="edit" data-id="${entry.id}">Edit</button>
              <button type="button" class="danger" data-entity="draft-labour" data-action="delete" data-id="${entry.id}">Remove</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function addDraftLabourEntry() {
  const minutes = Number(els.ticketLabourMinutes.value || 0);
  const loggedAt = els.ticketLabourLoggedAt.value;

  if (!Number.isInteger(minutes) || minutes <= 0) {
    setMessage(els.ticketMessage, "Labour minutes must be a whole number greater than 0.", "error");
    return;
  }

  state.draftLabourEntries.push({
    id: crypto.randomUUID(),
    minutes,
    loggedAt: loggedAt || defaultDateTimeValue(),
  });

  els.ticketLabourMinutes.value = "";
  setMessage(els.ticketMessage, "Labour entry queued for the ticket.", "success");
  renderDraftLabourEntries();
}

function editDraftLabourEntry(entryId) {
  const entry = state.draftLabourEntries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  els.ticketLabourMinutes.value = String(entry.minutes);
  els.ticketLabourLoggedAt.value = entry.loggedAt;
  state.draftLabourEntries = state.draftLabourEntries.filter((item) => item.id !== entryId);
  renderDraftLabourEntries();
}

function removeDraftLabourEntry(entryId) {
  state.draftLabourEntries = state.draftLabourEntries.filter((entry) => entry.id !== entryId);
  renderDraftLabourEntries();
}

function renderTickets() {
  if (!state.tickets.length) {
    els.ticketRows.innerHTML = '<tr><td colspan="6"><small>No tickets yet.</small></td></tr>';
    return;
  }

  els.ticketRows.innerHTML = state.tickets
    .map((ticket) => {
      const customer = ticket.customer;
      const customerLabel = customer
        ? `${escapeHtml(customer.organizationName)}<br /><small>${escapeHtml(customer.contactName)}</small>`
        : "<small>Unknown customer</small>";

      return `
        <tr>
          <td>${customerLabel}</td>
          <td>
            <strong>${escapeHtml(ticket.brand)} ${escapeHtml(ticket.model)}</strong><br />
            <small>${escapeHtml(ticket.deviceType)} ${ticket.serialNumber ? `| ${escapeHtml(ticket.serialNumber)}` : ""}</small>
          </td>
          <td>${escapeHtml(ticket.issue)}</td>
          <td>${escapeHtml(ticket.dueDate || "-")}</td>
          <td>
            <select class="status-cell" data-entity="ticket" data-action="change-status" data-id="${ticket.id}">
              ${statusOptions(ticket.status)}
            </select>
          </td>
          <td>
            <div class="inline-actions">
              <button type="button" class="ghost" data-entity="ticket" data-action="open" data-id="${ticket.id}">Open</button>
              <button type="button" class="ghost" data-entity="ticket" data-action="edit" data-id="${ticket.id}">Edit</button>
              <button type="button" class="ghost" data-entity="ticket" data-action="invoice" data-id="${ticket.id}">Invoice</button>
              <button type="button" class="danger" data-entity="ticket" data-action="delete" data-id="${ticket.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderLabourLogs() {
  const ticket = state.tickets.find((entry) => entry.id === state.selectedTicketId);
  if (!ticket) {
    els.labourTicketLabel.textContent = "Select a ticket to log labour.";
    els.labourRows.innerHTML = '<tr><td colspan="4"><small>No ticket selected.</small></td></tr>';
    els.labourForm.elements.ticketId.value = "";
    els.labourForm.elements.labourEntryId.value = "";
    els.labourSubmitBtn.textContent = "Add Labour Entry";
    return;
  }

  els.labourTicketLabel.textContent = `${ticket.brand} ${ticket.model} (${ticket.id.slice(0, 8)})`;
  els.labourForm.elements.ticketId.value = ticket.id;

  if (!ticket.labourLogs?.length) {
    els.labourRows.innerHTML = '<tr><td colspan="4"><small>No labour entries logged yet.</small></td></tr>';
    return;
  }

  els.labourRows.innerHTML = ticket.labourLogs
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(formatLoggedAt(entry.loggedAt))}</td>
          <td>${entry.minutes}</td>
          <td>${escapeHtml(entry.note || "")}</td>
          <td>
            <div class="inline-actions">
              <button type="button" class="ghost" data-entity="labour" data-action="edit" data-id="${entry.id}" data-ticket-id="${ticket.id}">Edit</button>
              <button type="button" class="danger" data-entity="labour" data-action="delete" data-id="${entry.id}" data-ticket-id="${ticket.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function resetTicketForm() {
  els.ticketForm.reset();
  els.ticketForm.elements.id.value = "";
  state.selectedTicketId = null;
  els.ticketForm.elements.dueDate.value = defaultDueDateValue();
  els.ticketFormTitle.textContent = "New Repair Ticket";
  els.ticketSubmitBtn.textContent = "Create Ticket";
  els.ticketCancelBtn.classList.add("hidden");
  resetTicketLabourBuilder();
  populateTicketCustomerOptions();
  populateStatusOptions();
  setMessage(els.ticketMessage);
  renderLabourLogs();
}

function resetLabourForm() {
  els.labourForm.reset();
  els.labourForm.elements.labourEntryId.value = "";
  els.labourForm.elements.loggedAt.value = defaultDateTimeValue();
  els.labourSubmitBtn.textContent = "Add Labour Entry";
  setMessage(els.labourMessage);
  renderLabourLogs();
}

function loadTicketIntoForm(ticket) {
  els.ticketForm.elements.id.value = ticket.id;
  els.ticketForm.elements.customerId.value = ticket.customerId;
  els.ticketForm.elements.correspondenceEmail.value = ticket.correspondenceEmail || ticket.customer?.email || "";
  els.ticketForm.elements.deviceType.value = ticket.deviceType;
  els.ticketForm.elements.brand.value = ticket.brand;
  els.ticketForm.elements.model.value = ticket.model;
  els.ticketForm.elements.dueDate.value = ticket.dueDate;
  els.ticketForm.elements.serialNumber.value = ticket.serialNumber;
  els.ticketForm.elements.issue.value = ticket.issue;
  els.ticketForm.elements.notes.value = ticket.notes;
  els.ticketForm.elements.workCompletedSummary.value = ticket.workCompletedSummary || "";
  els.ticketForm.elements.status.value = ticket.status;
  state.selectedTicketId = ticket.id;
  resetTicketLabourBuilder();
  els.ticketFormTitle.textContent = "Edit Ticket";
  els.ticketSubmitBtn.textContent = "Save Ticket";
  els.ticketCancelBtn.classList.remove("hidden");
  renderLabourLogs();
}

function fillLabourForm(ticket, entry) {
  state.selectedTicketId = ticket.id;
  els.labourForm.elements.ticketId.value = ticket.id;
  els.labourForm.elements.labourEntryId.value = entry.id;
  els.labourForm.elements.minutes.value = String(entry.minutes);
  els.labourForm.elements.loggedAt.value = entry.loggedAt.slice(0, 16);
  els.labourForm.elements.note.value = entry.note || "";
  els.labourSubmitBtn.textContent = "Save Labour Entry";
  renderLabourLogs();
}

async function reloadAll() {
  const [customers, tickets] = await Promise.all([fetchJson("/api/customers"), fetchJson("/api/tickets")]);
  state.customers = customers.data;
  state.tickets = tickets.data;
  populateTicketCustomerOptions();
  renderTickets();
  renderLabourLogs();
}

els.refreshBtn.addEventListener("click", () => {
  void reloadAll();
});

els.ticketLabourAddBtn.addEventListener("click", () => {
  addDraftLabourEntry();
});

els.ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.ticketForm).entries());
  const id = payload.id;
  delete payload.id;
  payload.dueDate = payload.dueDate || defaultDueDateValue();

  try {
    const isEdit = Boolean(id);
    const response = await fetchJson(isEdit ? `/api/tickets/${id}` : "/api/tickets", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const ticketId = response.data.id;
    for (const entry of state.draftLabourEntries) {
      await fetchJson(`/api/tickets/${ticketId}/labour`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: entry.minutes, loggedAt: entry.loggedAt }),
      });
    }

    resetTicketForm();
    setMessage(els.ticketMessage, isEdit ? "Ticket updated." : "Ticket created.", "success");
    await reloadAll();
  } catch (error) {
    setMessage(els.ticketMessage, error.message, "error");
  }
});

els.labourForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticketId = els.labourForm.elements.ticketId.value;
  if (!ticketId) {
    setMessage(els.labourMessage, "Select a ticket first.", "error");
    return;
  }

  const payload = Object.fromEntries(new FormData(els.labourForm).entries());
  const labourEntryId = payload.labourEntryId;
  delete payload.labourEntryId;

  try {
    const isEdit = Boolean(labourEntryId);
    await fetchJson(isEdit ? `/api/tickets/${ticketId}/labour/${labourEntryId}` : `/api/tickets/${ticketId}/labour`, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setMessage(els.labourMessage, isEdit ? "Labour entry updated." : "Labour entry added.", "success");
    await reloadAll();
    resetLabourForm();
  } catch (error) {
    setMessage(els.labourMessage, error.message, "error");
  }
});

els.ticketCancelBtn.addEventListener("click", resetTicketForm);

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const { entity, action, id } = target.dataset;
  if (!entity || !action || !id) {
    return;
  }

  if (entity === "ticket" && action === "open") {
    window.location.href = `/ticket?id=${encodeURIComponent(id)}`;
    return;
  }

  if (entity === "ticket" && action === "invoice") {
    window.location.href = `/invoices?ticketId=${encodeURIComponent(id)}`;
    return;
  }

  if (entity === "ticket" && action === "edit") {
    const ticket = state.tickets.find((item) => item.id === id);
    if (ticket) {
      loadTicketIntoForm(ticket);
    }
    return;
  }

  if (entity === "draft-labour" && action === "edit") {
    editDraftLabourEntry(id);
    return;
  }

  if (entity === "draft-labour" && action === "delete") {
    removeDraftLabourEntry(id);
    return;
  }

  if (entity === "labour" && action === "edit") {
    const ticketId = target.dataset.ticketId;
    const ticket = state.tickets.find((entry) => entry.id === ticketId);
    if (!ticket) {
      return;
    }

    const labourEntry = ticket.labourLogs.find((entry) => entry.id === id);
    if (!labourEntry) {
      return;
    }

    fillLabourForm(ticket, labourEntry);
    return;
  }

  if (action === "delete") {
    if (entity === "labour") {
      const ticketId = target.dataset.ticketId;
      const confirmed = window.confirm("Delete this labour log entry?");
      if (!confirmed || !ticketId) {
        return;
      }

      try {
        await fetchJson(`/api/tickets/${ticketId}/labour/${id}`, { method: "DELETE" });
        await reloadAll();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (entity === "ticket") {
      const confirmed = window.confirm("Delete this ticket?");
      if (!confirmed) {
        return;
      }

      try {
        await fetchJson(`/api/tickets/${id}`, { method: "DELETE" });
        await reloadAll();
        resetTicketForm();
      } catch (error) {
        window.alert(error.message);
      }
    }
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const { entity, action, id } = target.dataset;
  if (entity !== "ticket" || action !== "change-status" || !id) {
    return;
  }

  try {
    await fetchJson(`/api/tickets/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: target.value }),
    });

    await reloadAll();
  } catch (error) {
    setMessage(els.ticketMessage, error.message, "error");
    await reloadAll();
  }
});

resetTicketForm();
resetLabourForm();
void reloadAll();
