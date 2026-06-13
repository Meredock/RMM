const els = {
  metricCustomerCount: document.getElementById("metricCustomerCount"),
  metricOpenAccounts: document.getElementById("metricOpenAccounts"),
  metricLinkedTickets: document.getElementById("metricLinkedTickets"),
  form: document.getElementById("customerForm"),
  formTitle: document.getElementById("customerFormTitle"),
  submitBtn: document.getElementById("customerSubmitBtn"),
  cancelBtn: document.getElementById("customerCancelBtn"),
  message: document.getElementById("customerMessage"),
  rows: document.getElementById("customerRows"),
  refreshBtn: document.getElementById("refreshCustomersBtn"),
};

const state = {
  customers: [],
  tickets: [],
};

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

function resetForm() {
  els.form.reset();
  els.form.elements.id.value = "";
  els.formTitle.textContent = "Add Customer / Organisation";
  els.submitBtn.textContent = "Create Customer";
  els.cancelBtn.classList.add("hidden");
  setMessage();
}

function fillForm(customer) {
  els.form.elements.id.value = customer.id;
  els.form.elements.organizationName.value = customer.organizationName;
  els.form.elements.contactName.value = customer.contactName;
  els.form.elements.phone.value = customer.phone;
  els.form.elements.email.value = customer.email;
  els.form.elements.address.value = customer.address;
  els.form.elements.notes.value = customer.notes;
  els.formTitle.textContent = "Edit Customer / Organisation";
  els.submitBtn.textContent = "Save Customer";
  els.cancelBtn.classList.remove("hidden");
}

function renderMetrics() {
  const linkedTicketCount = state.tickets.length;
  const accountsWithOpenTickets = state.customers.filter((customer) =>
    state.tickets.some((ticket) => ticket.customerId === customer.id && ticket.status !== "customer has replied")
  ).length;

  els.metricCustomerCount.textContent = state.customers.length;
  els.metricOpenAccounts.textContent = accountsWithOpenTickets;
  els.metricLinkedTickets.textContent = linkedTicketCount;
}

function renderRows() {
  if (!state.customers.length) {
    els.rows.innerHTML =
      '<tr><td colspan="5"><small>No customers yet. Create your first organisation above.</small></td></tr>';
    return;
  }

  els.rows.innerHTML = state.customers
    .map((customer) => {
      const linked = state.tickets.filter((ticket) => ticket.customerId === customer.id).length;
      return `
        <tr>
          <td>
            <strong>${escapeHtml(customer.organizationName)}</strong><br />
            <small>${escapeHtml(customer.address)}</small>
          </td>
          <td>${escapeHtml(customer.contactName)}</td>
          <td>
            ${escapeHtml(customer.phone)}<br />
            <small>${escapeHtml(customer.email)}</small>
          </td>
          <td>${linked}</td>
          <td>
            <div class="inline-actions">
              <button type="button" class="ghost" data-action="edit" data-id="${customer.id}">Edit</button>
              <button type="button" class="danger" data-action="delete" data-id="${customer.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function reloadData() {
  const [customers, tickets] = await Promise.all([
    fetchJson("/api/customers"),
    fetchJson("/api/tickets"),
  ]);

  state.customers = customers.data;
  state.tickets = tickets.data;
  renderMetrics();
  renderRows();
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.form).entries());
  const id = payload.id;
  delete payload.id;

  try {
    await fetchJson(id ? `/api/customers/${id}` : "/api/customers", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    resetForm();
    setMessage(id ? "Customer updated." : "Customer created.", "success");
    await reloadData();
  } catch (error) {
    setMessage(error.message, "error");
  }
});

els.rows.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) {
    return;
  }

  const customer = state.customers.find((item) => item.id === id);
  if (!customer) {
    return;
  }

  if (action === "edit") {
    fillForm(customer);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this customer? This only works when no tickets are linked.");
    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/customers/${id}`, { method: "DELETE" });
      resetForm();
      await reloadData();
    } catch (error) {
      window.alert(error.message);
    }
  }
});

els.cancelBtn.addEventListener("click", resetForm);
els.refreshBtn.addEventListener("click", () => {
  void reloadData();
});

resetForm();
void reloadData();
