const els = {
  metricInventoryCount: document.getElementById("metricInventoryCount"),
  metricLowStockCount: document.getElementById("metricLowStockCount"),
  metricUnitsOnHand: document.getElementById("metricUnitsOnHand"),
  form: document.getElementById("inventoryForm"),
  formTitle: document.getElementById("inventoryFormTitle"),
  submitBtn: document.getElementById("inventorySubmitBtn"),
  cancelBtn: document.getElementById("inventoryCancelBtn"),
  message: document.getElementById("inventoryMessage"),
  rows: document.getElementById("inventoryRows"),
  refreshBtn: document.getElementById("refreshInventoryBtn"),
};

const state = {
  inventory: [],
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
  els.formTitle.textContent = "Add Inventory Item";
  els.submitBtn.textContent = "Create Inventory Item";
  els.cancelBtn.classList.add("hidden");
  setMessage();
}

function fillForm(item) {
  els.form.elements.id.value = item.id;
  els.form.elements.name.value = item.name;
  els.form.elements.category.value = item.category;
  els.form.elements.sku.value = item.sku;
  els.form.elements.unitCost.value = item.unitCost;
  els.form.elements.location.value = item.location;
  els.form.elements.quantity.value = item.quantity;
  els.form.elements.reorderLevel.value = item.reorderLevel;
  els.form.elements.notes.value = item.notes;
  els.formTitle.textContent = "Edit Inventory Item";
  els.submitBtn.textContent = "Save Inventory Item";
  els.cancelBtn.classList.remove("hidden");
}

function renderMetrics() {
  const totalItems = state.inventory.length;
  const lowStockItems = state.inventory.filter((item) => item.quantity <= item.reorderLevel).length;
  const unitsOnHand = state.inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  els.metricInventoryCount.textContent = totalItems;
  els.metricLowStockCount.textContent = lowStockItems;
  els.metricUnitsOnHand.textContent = unitsOnHand;
}

function renderRows() {
  if (!state.inventory.length) {
    els.rows.innerHTML =
      '<tr><td colspan="5"><small>No stock items yet. Add your first item above.</small></td></tr>';
    return;
  }

  els.rows.innerHTML = state.inventory
    .map((item) => {
      const stockClass = item.quantity <= item.reorderLevel ? "stock-low" : "";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong><br />
            <small>${escapeHtml(item.category)} | ${escapeHtml(item.sku)}</small>
          </td>
          <td>
            <span class="stock-pill ${stockClass}">${item.quantity} in stock</span><br />
            <small>Reorder at ${item.reorderLevel}</small>
          </td>
          <td>$${Number(item.unitCost || 0).toFixed(2)}</td>
          <td>
            ${escapeHtml(item.location)}${item.notes ? `<br /><small>${escapeHtml(item.notes)}</small>` : ""}
          </td>
          <td>
            <div class="inline-actions">
              <button type="button" class="ghost" data-action="edit" data-id="${item.id}">Edit</button>
              <button type="button" class="danger" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function reloadData() {
  const inventory = await fetchJson("/api/inventory");
  state.inventory = inventory.data;
  renderMetrics();
  renderRows();
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.form).entries());
  const id = payload.id;
  delete payload.id;

  try {
    await fetchJson(id ? `/api/inventory/${id}` : "/api/inventory", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    resetForm();
    setMessage(id ? "Inventory updated." : "Inventory item created.", "success");
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

  const item = state.inventory.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  if (action === "edit") {
    fillForm(item);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this inventory item?");
    if (!confirmed) {
      return;
    }

    try {
      await fetchJson(`/api/inventory/${id}`, { method: "DELETE" });
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
