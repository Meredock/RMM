const params = new URLSearchParams(window.location.search);
const ticketId = params.get("id");

const els = {
  title: document.getElementById("ticketTitle"),
  subtitle: document.getElementById("ticketSubtitle"),
  detailId: document.getElementById("detailId"),
  detailStatus: document.getElementById("detailStatus"),
  detailDue: document.getElementById("detailDue"),
  detailCustomer: document.getElementById("detailCustomer"),
  detailDevice: document.getElementById("detailDevice"),
  detailIssue: document.getElementById("detailIssue"),
  detailWork: document.getElementById("detailWork"),
  detailEmail: document.getElementById("detailEmail"),
  mailSubject: document.getElementById("mailSubject"),
  mailBody: document.getElementById("mailBody"),
  labourRate: document.getElementById("invoiceLabourRate"),
  saveEmailBtn: document.getElementById("saveEmailBtn"),
  sendMailBtn: document.getElementById("sendMailBtn"),
  sendInvoiceBtn: document.getElementById("sendInvoiceBtn"),
  openInvoiceLink: document.getElementById("openInvoiceLink"),
  message: document.getElementById("ticketMessage"),
};

let ticket = null;

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

function money(value) {
  return Number(value || 0).toFixed(2);
}

function toHours(minutes) {
  return Number(minutes || 0) / 60;
}

function defaultCorrespondenceBody() {
  if (!ticket) {
    return "";
  }

  return [
    `Hi ${ticket.customer?.contactName || "there"},`,
    "",
    `Update for ticket ${ticket.id.slice(0, 8)}:`,
    `Status: ${ticket.status}`,
    `Due date: ${ticket.dueDate}`,
    "",
    "Regards,",
    "Fixsmith",
  ].join("\n");
}

function buildInvoiceBody() {
  if (!ticket) {
    return "";
  }

  const labourRate = Number(els.labourRate.value || 0);
  const totalMinutes = (ticket.labourLogs || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const labourHours = toHours(totalMinutes);
  const labourCharge = labourHours * labourRate;
  const partsTotal = (ticket.partsUsed || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
    0
  );
  const grandTotal = labourCharge + partsTotal;

  return [
    `Invoice summary for ticket ${ticket.id.slice(0, 8)}`,
    `Customer: ${ticket.customer?.organizationName || "-"}`,
    `Device: ${ticket.brand} ${ticket.model}`,
    "",
    `Labour hours: ${labourHours.toFixed(2)}`,
    `Labour charge: $${money(labourCharge)}`,
    `Parts total: $${money(partsTotal)}`,
    `Invoice total: $${money(grandTotal)}`,
    "",
    "Regards,",
    "Fixsmith",
  ].join("\n");
}

async function sendEmail(subject, body) {
  if (!ticket) {
    return;
  }

  const email = (els.detailEmail.value || "").trim();
  if (!email) {
    setMessage("Enter a client email first.", "error");
    return;
  }

  await fetchJson(`/api/tickets/${ticket.id}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: email, subject, body }),
  });
}

function render() {
  if (!ticket) {
    return;
  }

  els.title.textContent = `Ticket ${ticket.id.slice(0, 8)}`;
  els.subtitle.textContent = ticket.issue;
  els.detailId.textContent = ticket.id;
  els.detailStatus.textContent = ticket.status;
  els.detailDue.textContent = ticket.dueDate || "-";
  els.detailCustomer.textContent = ticket.customer
    ? `${ticket.customer.organizationName} (${ticket.customer.contactName})`
    : "Unknown customer";
  els.detailDevice.textContent = `${ticket.brand} ${ticket.model} (${ticket.deviceType})`;
  els.detailIssue.textContent = `Issue: ${ticket.issue}`;
  els.detailWork.textContent = ticket.workCompletedSummary ? `Work Completed: ${ticket.workCompletedSummary}` : "Work Completed: -";

  els.detailEmail.value = ticket.correspondenceEmail || ticket.customer?.email || "";
  els.mailSubject.value = `Update: Ticket ${ticket.id.slice(0, 8)}`;
  els.mailBody.value = defaultCorrespondenceBody();
  els.openInvoiceLink.href = `/invoices?ticketId=${encodeURIComponent(ticket.id)}`;
}

async function loadTicket() {
  if (!ticketId) {
    setMessage("No ticket id provided in URL.", "error");
    return;
  }

  const response = await fetchJson(`/api/tickets/${ticketId}`);
  ticket = response.data;
  render();
}

els.saveEmailBtn.addEventListener("click", async () => {
  if (!ticket) {
    return;
  }

  try {
    const response = await fetchJson(`/api/tickets/${ticket.id}/contact-email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correspondenceEmail: els.detailEmail.value }),
    });

    ticket = response.data;
    setMessage("Client email saved.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

els.sendMailBtn.addEventListener("click", () => {
  void (async () => {
    try {
      await sendEmail(els.mailSubject.value || "Ticket Update", els.mailBody.value || "");
      setMessage("Correspondence email sent.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  })();
});

els.sendInvoiceBtn.addEventListener("click", () => {
  void (async () => {
    try {
      const subject = ticket ? `Invoice: Ticket ${ticket.id.slice(0, 8)}` : "Invoice";
      await sendEmail(subject, buildInvoiceBody());
      setMessage("Invoice email sent.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  })();
});

void loadTicket();
