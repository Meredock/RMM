const els = {
  title: document.getElementById("calTitle"),
  titleToggle: document.getElementById("calTitleToggle"),
  jumpPanel: document.getElementById("calJumpPanel"),
  grid: document.getElementById("calendarGrid"),
  prevBtn: document.getElementById("calPrevBtn"),
  nextBtn: document.getElementById("calNextBtn"),
  jumpDay: document.getElementById("calJumpDay"),
  jumpMonth: document.getElementById("calJumpMonth"),
  jumpYear: document.getElementById("calJumpYear"),
  jumpGo: document.getElementById("calJumpGo"),
  filterStatus: document.getElementById("calFilterStatus"),
  filterCustomer: document.getElementById("calFilterCustomer"),
  filterSearch: document.getElementById("calFilterSearch"),
  filterOverdue: document.getElementById("calFilterOverdue"),
  filterReset: document.getElementById("calFilterReset"),
  selectedDateLabel: document.getElementById("selectedDateLabel"),
  form: document.getElementById("calendarTicketForm"),
  customerSelect: document.getElementById("calendarCustomerSelect"),
  dueDateInput: document.getElementById("calendarDueDate"),
  message: document.getElementById("calendarMessage"),
};

const state = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: defaultDueDateValue(),
  customers: [],
  tickets: [],
  filters: {
    status: "",
    customerId: "",
    search: "",
    overdueOnly: false,
  },
};

function defaultDueDateValue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMessage(text = "", type = "") {
  els.message.textContent = text;
  els.message.className = type ? `message ${type}` : "message";
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

function populateCustomers() {
  if (!state.customers.length) {
    els.customerSelect.innerHTML = '<option value="">Create a customer first</option>';
    els.customerSelect.disabled = true;
    els.filterCustomer.innerHTML = '<option value="">All customers</option>';
    els.filterCustomer.disabled = true;
    return;
  }

  els.customerSelect.disabled = false;
  els.filterCustomer.disabled = false;
  els.customerSelect.innerHTML = state.customers
    .map(
      (customer) =>
        `<option value="${customer.id}">${escapeHtml(customer.organizationName)} - ${escapeHtml(customer.contactName)}</option>`
    )
    .join("");

  els.filterCustomer.innerHTML =
    '<option value="">All customers</option>' +
    state.customers
      .map(
        (customer) => `<option value="${customer.id}">${escapeHtml(customer.organizationName)} - ${escapeHtml(customer.contactName)}</option>`
      )
      .join("");
}

function setSelectedDate(value) {
  state.selectedDate = value;
  els.dueDateInput.value = value;
  els.selectedDateLabel.textContent = value;
  syncJumpSelectors(value);
}

function initJumpSelectors() {
  const monthLabels = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  els.jumpMonth.innerHTML = monthLabels
    .map((label, index) => `<option value="${index}">${label}</option>`)
    .join("");

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 5;
  const yearOptions = [];
  for (let year = startYear; year <= endYear; year += 1) {
    yearOptions.push(`<option value="${year}">${year}</option>`);
  }
  els.jumpYear.innerHTML = yearOptions.join("");
}

function refreshJumpDays(preferredDay) {
  const year = Number(els.jumpYear.value);
  const month = Number(els.jumpMonth.value);
  const maxDays = daysInMonth(year, month);
  const targetDay = Math.min(Math.max(Number(preferredDay) || 1, 1), maxDays);

  const dayOptions = [];
  for (let day = 1; day <= maxDays; day += 1) {
    dayOptions.push(`<option value="${day}">${day}</option>`);
  }

  els.jumpDay.innerHTML = dayOptions.join("");
  els.jumpDay.value = String(targetDay);
}

function syncJumpSelectors(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  els.jumpYear.value = String(year);
  els.jumpMonth.value = String(month - 1);
  refreshJumpDays(day);
}

function jumpDateValue() {
  const year = Number(els.jumpYear.value);
  const month = Number(els.jumpMonth.value);
  const day = Number(els.jumpDay.value);
  return formatDateKey(year, month, day);
}

function setJumpPanelOpen(isOpen) {
  els.jumpPanel.classList.toggle("hidden", !isOpen);
  els.titleToggle.setAttribute("aria-expanded", String(isOpen));
}

function ticketsForDate(dateKey) {
  return filteredTickets().filter((ticket) => ticket.dueDate === dateKey);
}

function filteredTickets() {
  const searchTerm = state.filters.search.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  return state.tickets.filter((ticket) => {
    if (state.filters.status && ticket.status !== state.filters.status) {
      return false;
    }

    if (state.filters.customerId && ticket.customerId !== state.filters.customerId) {
      return false;
    }

    if (state.filters.overdueOnly && ticket.dueDate >= today) {
      return false;
    }

    if (searchTerm) {
      const haystack = [
        ticket.brand,
        ticket.model,
        ticket.issue,
        ticket.customer?.organizationName || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });
}

function ticketUpdatePayload(ticket, dueDate) {
  return {
    customerId: ticket.customerId,
    deviceType: ticket.deviceType,
    brand: ticket.brand,
    model: ticket.model,
    dueDate,
    serialNumber: ticket.serialNumber || "",
    issue: ticket.issue,
    notes: ticket.notes || "",
    status: ticket.status,
  };
}

async function moveTicket(ticketId, dueDate) {
  const ticket = state.tickets.find((entry) => entry.id === ticketId);
  if (!ticket) {
    return;
  }

  if (ticket.dueDate === dueDate) {
    return;
  }

  await fetchJson(`/api/tickets/${ticket.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketUpdatePayload(ticket, dueDate)),
  });

  setMessage(`Moved ticket to ${dueDate}.`, "success");
  setSelectedDate(dueDate);
  await reloadData();
}

function renderCalendar() {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  els.title.textContent = state.month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<article class="calendar-day muted"></article>');
  }

  const today = new Date().toISOString().slice(0, 10);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKey(year, month, day);
    const dayTickets = ticketsForDate(dateKey);
    const eventMarkup = dayTickets
      .slice(0, 3)
      .map(
        (ticket) =>
          `<li class="calendar-event-item" draggable="true" data-ticket-id="${ticket.id}" data-date="${dateKey}"><strong>${escapeHtml(ticket.brand)} ${escapeHtml(ticket.model)}</strong><br /><small>${escapeHtml(ticket.customer?.organizationName || "Unknown customer")} | ${escapeHtml(ticket.status)}</small></li>`
      )
      .join("");

    const classes = ["calendar-day"];
    if (dateKey === today) classes.push("today");
    if (dateKey === state.selectedDate) classes.push("selected");

    cells.push(`
      <article class="${classes.join(" ")}" data-date="${dateKey}">
        <header>
          <button type="button" class="calendar-day-btn" data-date="${dateKey}">${day}</button>
          <span class="event-count">${dayTickets.length ? `${dayTickets.length} due` : ""}</span>
        </header>
        <ul class="calendar-events">${eventMarkup}</ul>
        ${dayTickets.length > 3 ? `<p class="event-more">+${dayTickets.length - 3} more</p>` : ""}
      </article>
    `);
  }

  els.grid.innerHTML = cells.join("");
}

async function reloadData() {
  const [customers, tickets] = await Promise.all([fetchJson("/api/customers"), fetchJson("/api/tickets")]);
  state.customers = customers.data;
  state.tickets = tickets.data;
  populateCustomers();
  renderCalendar();
}

els.prevBtn.addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
  renderCalendar();
});

els.nextBtn.addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
  renderCalendar();
});

els.jumpMonth.addEventListener("change", () => {
  refreshJumpDays(els.jumpDay.value);
});

els.jumpYear.addEventListener("change", () => {
  refreshJumpDays(els.jumpDay.value);
});

els.jumpGo.addEventListener("click", () => {
  const dateValue = jumpDateValue();
  const [year, month] = dateValue.split("-").map(Number);
  state.month = new Date(year, month - 1, 1);
  setSelectedDate(dateValue);
  renderCalendar();
  setJumpPanelOpen(false);
});

els.titleToggle.addEventListener("click", () => {
  const isOpen = els.titleToggle.getAttribute("aria-expanded") === "true";
  setJumpPanelOpen(!isOpen);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (els.titleToggle.contains(target) || els.jumpPanel.contains(target)) {
    return;
  }

  setJumpPanelOpen(false);
});

els.grid.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const dayElement = target.closest("[data-date]");
  const dateKey = dayElement instanceof HTMLElement ? dayElement.dataset.date : undefined;
  if (!dateKey) {
    return;
  }

  setSelectedDate(dateKey);
  renderCalendar();
});

els.grid.addEventListener("dragstart", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const eventItem = target.closest(".calendar-event-item");
  if (!(eventItem instanceof HTMLElement) || !event.dataTransfer) {
    return;
  }

  const ticketId = eventItem.dataset.ticketId;
  if (!ticketId) {
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/ticket-id", ticketId);
  eventItem.classList.add("dragging");
});

els.grid.addEventListener("dragend", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const eventItem = target.closest(".calendar-event-item");
  if (eventItem instanceof HTMLElement) {
    eventItem.classList.remove("dragging");
  }

  els.grid.querySelectorAll(".calendar-day.drop-target").forEach((el) => el.classList.remove("drop-target"));
});

els.grid.addEventListener("dragover", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const dayElement = target.closest(".calendar-day[data-date]");
  if (!(dayElement instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
});

els.grid.addEventListener("dragenter", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const dayElement = target.closest(".calendar-day[data-date]");
  if (!(dayElement instanceof HTMLElement)) {
    return;
  }

  dayElement.classList.add("drop-target");
});

els.grid.addEventListener("dragleave", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const dayElement = target.closest(".calendar-day[data-date]");
  if (!(dayElement instanceof HTMLElement)) {
    return;
  }

  if (!dayElement.contains(event.relatedTarget)) {
    dayElement.classList.remove("drop-target");
  }
});

els.grid.addEventListener("drop", async (event) => {
  event.preventDefault();
  const target = event.target;
  if (!(target instanceof HTMLElement) || !event.dataTransfer) {
    return;
  }

  const dayElement = target.closest(".calendar-day[data-date]");
  if (!(dayElement instanceof HTMLElement)) {
    return;
  }

  dayElement.classList.remove("drop-target");

  const dueDate = dayElement.dataset.date;
  const ticketId = event.dataTransfer.getData("text/ticket-id");
  if (!ticketId || !dueDate) {
    return;
  }

  try {
    await moveTicket(ticketId, dueDate);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

els.filterStatus.addEventListener("change", () => {
  state.filters.status = els.filterStatus.value;
  renderCalendar();
});

els.filterCustomer.addEventListener("change", () => {
  state.filters.customerId = els.filterCustomer.value;
  renderCalendar();
});

els.filterSearch.addEventListener("input", () => {
  state.filters.search = els.filterSearch.value.trim();
  renderCalendar();
});

els.filterOverdue.addEventListener("change", () => {
  state.filters.overdueOnly = els.filterOverdue.checked;
  renderCalendar();
});

els.filterReset.addEventListener("click", () => {
  state.filters.status = "";
  state.filters.customerId = "";
  state.filters.search = "";
  state.filters.overdueOnly = false;
  els.filterStatus.value = "";
  els.filterCustomer.value = "";
  els.filterSearch.value = "";
  els.filterOverdue.checked = false;
  renderCalendar();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.form).entries());
  payload.dueDate = payload.dueDate || defaultDueDateValue();

  try {
    await fetchJson("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setMessage("Ticket created from calendar.", "success");
    els.form.reset();
    setSelectedDate(state.selectedDate);
    await reloadData();
  } catch (error) {
    setMessage(error.message, "error");
  }
});

initJumpSelectors();
setSelectedDate(state.selectedDate);
setJumpPanelOpen(false);
void reloadData();
