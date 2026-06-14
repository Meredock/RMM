import http from "http";
import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { readFile, readFileSync } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { jwtVerify } from "jose";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const SESSION_COOKIE = "rmm_session";
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod"
);

type RepairStatus = "new" | "in progress" | "waiting for parts" | "waiting for customer" | "customer has replied";

interface Customer {
  id: string;
  organizationName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  unitCost: number;
  quantity: number;
  reorderLevel: number;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketPartEntry {
  id: string;
  inventoryItemId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  addedAt: string;
}

interface LabourLogEntry {
  id: string;
  minutes: number;
  note: string;
  loggedAt: string;
}

interface RepairTicket {
  id: string;
  customerId: string;
  correspondenceEmail: string;
  deviceType: string;
  brand: string;
  model: string;
  dueDate: string;
  serialNumber: string;
  issue: string;
  notes: string;
  workCompletedSummary: string;
  labourLogs: LabourLogEntry[];
  partsUsed: TicketPartEntry[];
  status: RepairStatus;
  createdAt: string;
  updatedAt: string;
}

interface TicketView extends RepairTicket {
  customer: Customer | null;
}

interface CreateCustomerInput {
  organizationName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

interface CreateInventoryInput {
  name: string;
  category: string;
  sku: string;
  unitCost: number;
  quantity: number;
  reorderLevel: number;
  location: string;
  notes: string;
}

interface CreateTicketInput {
  customerId: string;
  correspondenceEmail: string;
  deviceType: string;
  brand: string;
  model: string;
  dueDate: string;
  serialNumber: string;
  issue: string;
  notes: string;
  workCompletedSummary: string;
}

interface LabourLogPayload {
  minutes: number;
  note?: string;
  loggedAt?: string;
}

type UpdateLabourLogPayload = LabourLogPayload;

interface TicketPartPayload {
  inventoryItemId: string;
  quantity: number;
}

interface UpdateStatusInput {
  status: RepairStatus;
}

interface UpdateContactEmailInput {
  correspondenceEmail: string;
}

interface SendTicketEmailPayload {
  to?: string;
  subject: string;
  body: string;
}

type CustomerPayload = Partial<CreateCustomerInput>;
type InventoryPayload = Partial<CreateInventoryInput>;
type TicketPayload = Partial<CreateTicketInput> & Partial<UpdateStatusInput>;

const VALID_STATUSES: RepairStatus[] = [
  "new",
  "in progress",
  "waiting for parts",
  "waiting for customer",
  "customer has replied",
];

const SMTP_HOST = trimValue(process.env.SMTP_HOST);
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = trimValue(process.env.SMTP_USER);
const SMTP_PASS = trimValue(process.env.SMTP_PASS);
const SMTP_FROM = trimValue(process.env.SMTP_FROM) || SMTP_USER;
const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

const smtpTransporter = isSmtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const DATABASE_URL = process.env.DATABASE_URL;
let pool: mysql.Pool | null = null;

if (DATABASE_URL) {
  pool = mysql.createPool(DATABASE_URL);
}

const ROUTE_MAP: Record<string, string> = {
  "/app": "/dashboard.html",
  "/dashboard": "/dashboard.html",
  "/tickets": "/tickets.html",
  "/ticket": "/ticket.html",
  "/customers": "/customers.html",
  "/inventory": "/inventory.html",
  "/calendar": "/calendar.html",
  "/reports": "/reports.html",
  "/invoices": "/invoices.html",
};

const MAX_BODY_BYTES = 1_048_576;

function nowIso(): string {
  return new Date().toISOString();
}

function dueDateFromNow(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res: ServerResponse, statusCode: number, contentType: string, body: string): void {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: "Route not found" });
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookieHeader = req.headers.cookie ?? "";
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
}

async function isAuthenticated(req: IncomingMessage): Promise<boolean> {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

async function servePublicFile(res: ServerResponse, requestedPath: string): Promise<boolean> {
  const normalizedPath = ROUTE_MAP[requestedPath] ?? requestedPath;
  const absolutePath = path.resolve(PUBLIC_DIR, `.${normalizedPath}`);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "text/plain", "Forbidden");
    return true;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentTypeByExtension: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
  };

  const contentType = contentTypeByExtension[extension];
  if (!contentType) return false;

  return new Promise((resolve) => {
    readFile(absolutePath, "utf8", (err, data) => {
      if (err) {
        sendText(res, 404, "text/plain", "Not found");
      } else {
        sendText(res, 200, contentType, data);
      }
      resolve(true);
    });
  });
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    let byteCount = 0;

    req.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on("end", () => {
      if (!body.trim()) {
        reject(new Error("Request body cannot be empty"));
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", () => reject(new Error("Unable to read request body")));
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type SqlParam = string | number | boolean | null | Buffer | Date;

async function q<T extends RowDataPacket>(sql: string, params?: SqlParam[]): Promise<T[]> {
  const [rows] = await pool!.execute<T[]>(sql, params ?? []);
  return rows;
}

async function getCustomerById(id: string): Promise<Customer | undefined> {
  if (!pool) return undefined;
  const rows = await q<RowDataPacket>(
    "SELECT id, organization_name AS organizationName, contact_name AS contactName, phone, email, address, notes, created_at AS createdAt, updated_at AS updatedAt FROM customers WHERE id = ?",
    [id]
  );
  return rows[0] as Customer | undefined;
}

async function getInventoryItemById(id: string): Promise<InventoryItem | undefined> {
  if (!pool) return undefined;
  const rows = await q<RowDataPacket>(
    "SELECT id, name, category, sku, unit_cost AS unitCost, quantity, reorder_level AS reorderLevel, location, notes, created_at AS createdAt, updated_at AS updatedAt FROM inventory WHERE id = ?",
    [id]
  );
  return rows[0] as InventoryItem | undefined;
}

function toDateStr(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

async function getTicketById(id: string): Promise<RepairTicket | undefined> {
  if (!pool) return undefined;

  const ticketRows = await q<RowDataPacket>(
    `SELECT id, customer_id AS customerId, correspondence_email AS correspondenceEmail,
            device_type AS deviceType, brand, model, due_date AS dueDate,
            serial_number AS serialNumber, issue, notes,
            work_completed_summary AS workCompletedSummary, status,
            created_at AS createdAt, updated_at AS updatedAt
     FROM tickets WHERE id = ?`,
    [id]
  );
  if (!ticketRows[0]) return undefined;

  const ticket = ticketRows[0];

  const labourRows = await q<RowDataPacket>(
    "SELECT id, minutes, note, logged_at AS loggedAt FROM labour_logs WHERE ticket_id = ? ORDER BY logged_at DESC",
    [id]
  );

  const partsRows = await q<RowDataPacket>(
    "SELECT id, inventory_item_id AS inventoryItemId, name, sku, quantity, unit_cost AS unitCost, added_at AS addedAt FROM parts_used WHERE ticket_id = ? ORDER BY added_at DESC",
    [id]
  );

  return {
    ...ticket,
    dueDate: toDateStr(ticket.dueDate),
    labourLogs: labourRows as LabourLogEntry[],
    partsUsed: partsRows as TicketPartEntry[],
  } as RepairTicket;
}

async function withCustomer(ticket: RepairTicket): Promise<TicketView> {
  return { ...ticket, customer: (await getCustomerById(ticket.customerId)) ?? null };
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateCustomerPayload(payload: CustomerPayload): string[] {
  const errors: string[] = [];
  const required: Array<keyof CreateCustomerInput> = ["organizationName", "contactName", "phone", "email", "address"];
  for (const field of required) {
    if (!trimValue(payload[field])) errors.push(`Field '${field}' is required`);
  }
  return errors;
}

function validateInventoryPayload(payload: InventoryPayload): string[] {
  const errors: string[] = [];
  for (const field of ["name", "category", "sku", "location"] as Array<keyof CreateInventoryInput>) {
    if (!trimValue(payload[field])) errors.push(`Field '${field}' is required`);
  }
  if (parseNumberValue(payload.quantity) === null || (parseNumberValue(payload.quantity) ?? -1) < 0)
    errors.push("Field 'quantity' must be a number >= 0");
  if (parseNumberValue(payload.reorderLevel) === null || (parseNumberValue(payload.reorderLevel) ?? -1) < 0)
    errors.push("Field 'reorderLevel' must be a number >= 0");
  if (parseNumberValue(payload.unitCost) === null || (parseNumberValue(payload.unitCost) ?? -1) < 0)
    errors.push("Field 'unitCost' must be a number >= 0");
  return errors;
}

function validateTicketPayload(payload: TicketPayload, existingCustomers: { id: string }[]): string[] {
  const errors: string[] = [];
  for (const field of ["customerId", "deviceType", "brand", "model", "dueDate", "issue"] as Array<keyof CreateTicketInput>) {
    if (!trimValue(payload[field])) errors.push(`Field '${field}' is required`);
  }
  const customerId = trimValue(payload.customerId);
  if (customerId && !existingCustomers.find((c) => c.id === customerId))
    errors.push("Field 'customerId' must reference an existing customer");
  const email = trimValue(payload.correspondenceEmail);
  if (email && !/^\S+@\S+\.\S+$/.test(email))
    errors.push("Field 'correspondenceEmail' must be a valid email address");
  if (payload.status && !VALID_STATUSES.includes(payload.status))
    errors.push(`Field 'status' must be one of: ${VALID_STATUSES.join(", ")}`);
  const dueDate = trimValue(payload.dueDate);
  if (dueDate && !isValidDateOnly(dueDate))
    errors.push("Field 'dueDate' must be a valid date in YYYY-MM-DD format");
  return errors;
}

function validateLabourLogPayload(payload: Partial<LabourLogPayload>): string[] {
  const minutes = parseNumberValue(payload.minutes);
  if (minutes === null || minutes <= 0) return ["Field 'minutes' must be a number greater than 0"];
  return [];
}

function validateSendTicketEmailPayload(payload: Partial<SendTicketEmailPayload>): string[] {
  const errors: string[] = [];
  if (!trimValue(payload.subject)) errors.push("Field 'subject' is required");
  if (!trimValue(payload.body)) errors.push("Field 'body' is required");
  const to = trimValue(payload.to);
  if (to && !/^\S+@\S+\.\S+$/.test(to)) errors.push("Field 'to' must be a valid email address when provided");
  return errors;
}

// ── Write operations ──────────────────────────────────────────────────────────

async function createCustomer(payload: CreateCustomerInput): Promise<Customer> {
  if (!pool) throw new Error("Database not initialized");
  const id = randomUUID();
  const now = nowIso();
  await pool.execute(
    "INSERT INTO customers (id, organization_name, contact_name, phone, email, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, payload.organizationName, payload.contactName, payload.phone, payload.email, payload.address, payload.notes, now, now]
  );
  return { id, ...payload, createdAt: now, updatedAt: now };
}

async function updateCustomer(id: string, payload: CreateCustomerInput): Promise<Customer> {
  if (!pool) throw new Error("Database not initialized");
  const now = nowIso();
  await pool.execute(
    "UPDATE customers SET organization_name=?, contact_name=?, phone=?, email=?, address=?, notes=?, updated_at=? WHERE id=?",
    [payload.organizationName, payload.contactName, payload.phone, payload.email, payload.address, payload.notes, now, id]
  );
  return { id, ...payload, createdAt: now, updatedAt: now };
}

async function createInventoryItem(payload: CreateInventoryInput): Promise<InventoryItem> {
  if (!pool) throw new Error("Database not initialized");
  const id = randomUUID();
  const now = nowIso();
  await pool.execute(
    "INSERT INTO inventory (id, name, category, sku, unit_cost, quantity, reorder_level, location, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, payload.name, payload.category, payload.sku, payload.unitCost, payload.quantity, payload.reorderLevel, payload.location, payload.notes, now, now]
  );
  return { id, ...payload, createdAt: now, updatedAt: now };
}

async function updateInventoryItem(id: string, payload: CreateInventoryInput): Promise<InventoryItem> {
  if (!pool) throw new Error("Database not initialized");
  const now = nowIso();
  await pool.execute(
    "UPDATE inventory SET name=?, category=?, sku=?, unit_cost=?, quantity=?, reorder_level=?, location=?, notes=?, updated_at=? WHERE id=?",
    [payload.name, payload.category, payload.sku, payload.unitCost, payload.quantity, payload.reorderLevel, payload.location, payload.notes, now, id]
  );
  return { id, ...payload, createdAt: now, updatedAt: now };
}

async function createTicket(payload: CreateTicketInput): Promise<RepairTicket> {
  if (!pool) throw new Error("Database not initialized");
  const id = randomUUID();
  const now = nowIso();
  const customer = await getCustomerById(payload.customerId);
  const correspondenceEmail = trimValue(payload.correspondenceEmail) || customer?.email || "";
  await pool.execute(
    "INSERT INTO tickets (id, customer_id, correspondence_email, device_type, brand, model, due_date, serial_number, issue, notes, work_completed_summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, payload.customerId, correspondenceEmail, payload.deviceType, payload.brand, payload.model, payload.dueDate, payload.serialNumber, payload.issue, payload.notes, payload.workCompletedSummary, "new", now, now]
  );
  return { id, customerId: payload.customerId, correspondenceEmail, deviceType: payload.deviceType, brand: payload.brand, model: payload.model, dueDate: payload.dueDate, serialNumber: payload.serialNumber, issue: payload.issue, notes: payload.notes, workCompletedSummary: payload.workCompletedSummary, labourLogs: [], partsUsed: [], status: "new", createdAt: now, updatedAt: now };
}

async function updateTicket(id: string, payload: TicketPayload): Promise<RepairTicket> {
  if (!pool) throw new Error("Database not initialized");
  const now = nowIso();
  await pool.execute(
    "UPDATE tickets SET customer_id=?, correspondence_email=?, device_type=?, brand=?, model=?, due_date=?, serial_number=?, issue=?, notes=?, work_completed_summary=?, status=?, updated_at=? WHERE id=?",
    [trimValue(payload.customerId), trimValue(payload.correspondenceEmail || ""), trimValue(payload.deviceType), trimValue(payload.brand), trimValue(payload.model), trimValue(payload.dueDate), trimValue(payload.serialNumber), trimValue(payload.issue), trimValue(payload.notes), trimValue(payload.workCompletedSummary), payload.status || "new", now, id]
  );
  const ticket = await getTicketById(id);
  if (!ticket) throw new Error("Ticket not found after update");
  return ticket;
}

async function addLabourLog(ticketId: string, payload: LabourLogPayload): Promise<LabourLogEntry> {
  if (!pool) throw new Error("Database not initialized");
  const id = randomUUID();
  const loggedAt = trimValue(payload.loggedAt) || nowIso();
  await pool.execute("INSERT INTO labour_logs (id, ticket_id, minutes, note, logged_at) VALUES (?, ?, ?, ?, ?)", [id, ticketId, payload.minutes, trimValue(payload.note), loggedAt]);
  await pool.execute("UPDATE tickets SET updated_at=? WHERE id=?", [nowIso(), ticketId]);
  return { id, minutes: payload.minutes, note: trimValue(payload.note), loggedAt };
}

async function updateLabourLog(ticketId: string, entryId: string, payload: UpdateLabourLogPayload): Promise<LabourLogEntry | null> {
  if (!pool) throw new Error("Database not initialized");
  const rows = await q<RowDataPacket>("SELECT * FROM labour_logs WHERE id=? AND ticket_id=?", [entryId, ticketId]);
  if (!rows[0]) return null;
  const loggedAt = trimValue(payload.loggedAt) || String(rows[0].logged_at);
  await pool.execute("UPDATE labour_logs SET minutes=?, note=?, logged_at=? WHERE id=?", [payload.minutes, trimValue(payload.note), loggedAt, entryId]);
  await pool.execute("UPDATE tickets SET updated_at=? WHERE id=?", [nowIso(), ticketId]);
  return { id: entryId, minutes: payload.minutes, note: trimValue(payload.note), loggedAt };
}

async function addTicketPart(ticketId: string, item: InventoryItem, quantity: number): Promise<TicketPartEntry> {
  if (!pool) throw new Error("Database not initialized");
  const id = randomUUID();
  const now = nowIso();
  await pool.execute("INSERT INTO parts_used (id, ticket_id, inventory_item_id, name, sku, quantity, unit_cost, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, ticketId, item.id, item.name, item.sku, quantity, item.unitCost, now]);
  await pool.execute("UPDATE inventory SET quantity=quantity-?, updated_at=? WHERE id=?", [quantity, now, item.id]);
  await pool.execute("UPDATE tickets SET updated_at=? WHERE id=?", [now, ticketId]);
  return { id, inventoryItemId: item.id, name: item.name, sku: item.sku, quantity, unitCost: item.unitCost, addedAt: now };
}

async function removeTicketPart(ticketId: string, entryId: string): Promise<TicketPartEntry | null> {
  if (!pool) throw new Error("Database not initialized");
  const rows = await q<RowDataPacket>("SELECT * FROM parts_used WHERE id=? AND ticket_id=?", [entryId, ticketId]);
  if (!rows[0]) return null;
  const entry = rows[0];
  const now = nowIso();
  await pool.execute("DELETE FROM parts_used WHERE id=?", [entryId]);
  await pool.execute("UPDATE inventory SET quantity=quantity+?, updated_at=? WHERE id=?", [entry.quantity, now, entry.inventory_item_id]);
  await pool.execute("UPDATE tickets SET updated_at=? WHERE id=?", [now, ticketId]);
  return { id: entry.id, inventoryItemId: entry.inventory_item_id, name: entry.name, sku: entry.sku, quantity: entry.quantity, unitCost: entry.unit_cost, addedAt: String(entry.added_at) };
}

async function updateTicketStatus(ticketId: string, status: RepairStatus): Promise<RepairTicket> {
  if (!pool) throw new Error("Database not initialized");
  await pool.execute("UPDATE tickets SET status=?, updated_at=? WHERE id=?", [status, nowIso(), ticketId]);
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");
  return ticket;
}

async function deleteCustomerIfNoTickets(id: string): Promise<boolean> {
  if (!pool) throw new Error("Database not initialized");
  const rows = await q<RowDataPacket>("SELECT COUNT(*) AS count FROM tickets WHERE customer_id=?", [id]);
  if (Number(rows[0].count) > 0) return false;
  await pool.execute("DELETE FROM customers WHERE id=?", [id]);
  return true;
}

async function deleteTicket(id: string): Promise<void> {
  if (!pool) throw new Error("Database not initialized");
  const parts = await q<RowDataPacket>("SELECT * FROM parts_used WHERE ticket_id=?", [id]);
  for (const part of parts) {
    await pool.execute("UPDATE inventory SET quantity=quantity+? WHERE id=?", [part.quantity, part.inventory_item_id]);
  }
  await pool.execute("DELETE FROM tickets WHERE id=?", [id]);
}

async function deleteInventoryItem(id: string): Promise<void> {
  if (!pool) throw new Error("Database not initialized");
  await pool.execute("DELETE FROM inventory WHERE id=?", [id]);
}

async function deleteLabourLog(ticketId: string, entryId: string): Promise<void> {
  if (!pool) throw new Error("Database not initialized");
  await pool.execute("DELETE FROM labour_logs WHERE id=?", [entryId]);
  await pool.execute("UPDATE tickets SET updated_at=? WHERE id=?", [nowIso(), ticketId]);
}

// ── Database init ─────────────────────────────────────────────────────────────

async function initializeDatabase(): Promise<void> {
  if (!pool) {
    console.log("Warning: DATABASE_URL not set, running without persistence");
    return;
  }

  const schemaPath = path.resolve(process.cwd(), "migrations", "001_init.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  const conn = await pool.getConnection();
  try {
    const statements = schema.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
      } catch (err: any) {
        // 1061 = duplicate key name (index already exists), safe to skip
        if (err?.errno !== 1061) throw err;
      }
    }
    console.log("Database schema initialized");
  } finally {
    conn.release();
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const rawUrl = req.url ?? "/";
  const pathname = new URL(rawUrl, `http://localhost:${PORT}`).pathname;

  // Redirect root
  if (method === "GET" && pathname === "/") {
    res.writeHead(302, { Location: "/dashboard" });
    res.end();
    return;
  }

  // Serve static assets without auth
  if (method === "GET" && pathname.startsWith("/assets/")) {
    await servePublicFile(res, pathname);
    return;
  }

  // Auth check for page and API routes
  const authed = await isAuthenticated(req);
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      sendJson(res, 401, { error: "Unauthorized" });
    } else {
      res.writeHead(302, { Location: "https://portal.fixsmith.com.au/login?callbackUrl=https://tickets.fixsmith.com.au" });
      res.end();
    }
    return;
  }

  // Serve page routes
  if (method === "GET" && ROUTE_MAP[pathname]) {
    await servePublicFile(res, pathname);
    return;
  }

  // Health
  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "ok", database: pool ? "connected" : "not configured" });
    return;
  }

  // ── API ──

  // Dashboard
  if (method === "GET" && pathname === "/api/dashboard") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const byStatusRows = await q<RowDataPacket>("SELECT status, COUNT(*) AS count FROM tickets GROUP BY status");
      const byStatus = VALID_STATUSES.map((status) => ({
        status,
        count: Number(byStatusRows.find((r) => r.status === status)?.count ?? 0),
      }));
      const totalsRows = await q<RowDataPacket>(`
        SELECT
          (SELECT COUNT(*) FROM tickets) AS tickets,
          (SELECT COUNT(*) FROM tickets WHERE status != 'customer has replied') AS active,
          (SELECT COUNT(*) FROM tickets WHERE status = 'waiting for customer') AS readyForPickup,
          (SELECT COUNT(*) FROM customers) AS customers,
          (SELECT COUNT(*) FROM inventory) AS inventoryItems,
          (SELECT COUNT(*) FROM inventory WHERE quantity <= reorder_level) AS lowStock
      `);
      const t = totalsRows[0];
      sendJson(res, 200, {
        totals: {
          tickets: Number(t.tickets),
          active: Number(t.active),
          readyForPickup: Number(t.readyForPickup),
          customers: Number(t.customers),
          inventoryItems: Number(t.inventoryItems),
          lowStock: Number(t.lowStock),
        },
        byStatus,
      });
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Customers list
  if (method === "GET" && pathname === "/api/customers") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const rows = await q<RowDataPacket>("SELECT id, organization_name AS organizationName, contact_name AS contactName, phone, email, address, notes, created_at AS createdAt, updated_at AS updatedAt FROM customers ORDER BY created_at DESC");
      sendJson(res, 200, { data: rows });
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Create customer
  if (method === "POST" && pathname === "/api/customers") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const body = await parseJsonBody<CustomerPayload>(req);
      const errors = validateCustomerPayload(body);
      if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
      const customer = await createCustomer(body as CreateCustomerInput);
      sendJson(res, 201, { data: customer });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  // Single customer
  const customerMatch = pathname.match(/^\/api\/customers\/([a-z0-9-]+)$/i);
  if (customerMatch) {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const customer = await getCustomerById(customerMatch[1]);
      if (!customer) { sendJson(res, 404, { error: "Customer not found" }); return; }

      if (method === "GET") {
        const ticketRows = await q<RowDataPacket>(
          "SELECT id, customer_id AS customerId, correspondence_email AS correspondenceEmail, device_type AS deviceType, brand, model, due_date AS dueDate, serial_number AS serialNumber, issue, notes, work_completed_summary AS workCompletedSummary, status, created_at AS createdAt, updated_at AS updatedAt FROM tickets WHERE customer_id=? ORDER BY created_at DESC",
          [customer.id]
        );
        const tickets: TicketView[] = [];
        for (const row of ticketRows) {
          const labourRows = await q<RowDataPacket>("SELECT id, minutes, note, logged_at AS loggedAt FROM labour_logs WHERE ticket_id=? ORDER BY logged_at DESC", [row.id]);
          const partsRows = await q<RowDataPacket>("SELECT id, inventory_item_id AS inventoryItemId, name, sku, quantity, unit_cost AS unitCost, added_at AS addedAt FROM parts_used WHERE ticket_id=? ORDER BY added_at DESC", [row.id]);
          tickets.push({ ...row, dueDate: toDateStr(row.dueDate), labourLogs: labourRows as LabourLogEntry[], partsUsed: partsRows as TicketPartEntry[], customer } as TicketView);
        }
        sendJson(res, 200, { data: customer, tickets });
        return;
      }

      if (method === "PUT") {
        const body = await parseJsonBody<CustomerPayload>(req);
        const errors = validateCustomerPayload(body);
        if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
        const updated = await updateCustomer(customer.id, body as CreateCustomerInput);
        sendJson(res, 200, { data: updated });
        return;
      }

      if (method === "DELETE") {
        const success = await deleteCustomerIfNoTickets(customer.id);
        if (!success) { sendJson(res, 400, { error: "Cannot delete a customer with existing tickets" }); return; }
        sendJson(res, 200, { success: true });
        return;
      }
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Inventory list
  if (method === "GET" && pathname === "/api/inventory") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const rows = await q<RowDataPacket>("SELECT id, name, category, sku, unit_cost AS unitCost, quantity, reorder_level AS reorderLevel, location, notes, created_at AS createdAt, updated_at AS updatedAt FROM inventory ORDER BY created_at DESC");
      sendJson(res, 200, { data: rows });
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Create inventory item
  if (method === "POST" && pathname === "/api/inventory") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const body = await parseJsonBody<InventoryPayload>(req);
      const errors = validateInventoryPayload(body);
      if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
      const item = await createInventoryItem(body as CreateInventoryInput);
      sendJson(res, 201, { data: item });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  // Single inventory item
  const inventoryMatch = pathname.match(/^\/api\/inventory\/([a-z0-9-]+)$/i);
  if (inventoryMatch) {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const item = await getInventoryItemById(inventoryMatch[1]);
      if (!item) { sendJson(res, 404, { error: "Inventory item not found" }); return; }
      if (method === "GET") { sendJson(res, 200, { data: item }); return; }
      if (method === "PUT") {
        const body = await parseJsonBody<InventoryPayload>(req);
        const errors = validateInventoryPayload(body);
        if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
        const updated = await updateInventoryItem(item.id, body as CreateInventoryInput);
        sendJson(res, 200, { data: updated });
        return;
      }
      if (method === "DELETE") { await deleteInventoryItem(item.id); sendJson(res, 200, { success: true }); return; }
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Tickets list
  if (method === "GET" && pathname === "/api/tickets") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticketRows = await q<RowDataPacket>("SELECT id, customer_id AS customerId, correspondence_email AS correspondenceEmail, device_type AS deviceType, brand, model, due_date AS dueDate, serial_number AS serialNumber, issue, notes, work_completed_summary AS workCompletedSummary, status, created_at AS createdAt, updated_at AS updatedAt FROM tickets ORDER BY created_at DESC");
      const tickets: TicketView[] = [];
      for (const row of ticketRows) {
        const labourRows = await q<RowDataPacket>("SELECT id, minutes, note, logged_at AS loggedAt FROM labour_logs WHERE ticket_id=? ORDER BY logged_at DESC", [row.customerId ? row.id : row.id]);
        const partsRows = await q<RowDataPacket>("SELECT id, inventory_item_id AS inventoryItemId, name, sku, quantity, unit_cost AS unitCost, added_at AS addedAt FROM parts_used WHERE ticket_id=? ORDER BY added_at DESC", [row.id]);
        const customer = await getCustomerById(row.customerId);
        tickets.push({ ...row, dueDate: toDateStr(row.dueDate), labourLogs: labourRows as LabourLogEntry[], partsUsed: partsRows as TicketPartEntry[], customer: customer ?? null } as TicketView);
      }
      sendJson(res, 200, { data: tickets });
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Create ticket
  if (method === "POST" && pathname === "/api/tickets") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const body = await parseJsonBody<TicketPayload>(req);
      body.dueDate = trimValue(body.dueDate) || dueDateFromNow(7);
      const customerRows = await q<RowDataPacket>("SELECT id FROM customers");
      const errors = validateTicketPayload(body, customerRows as { id: string }[]);
      if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
      const ticket = await createTicket(body as CreateTicketInput);
      const view = await withCustomer(ticket);
      sendJson(res, 201, { data: view });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  // Single ticket
  const ticketMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)$/i);
  if (ticketMatch) {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      if (method === "GET") { sendJson(res, 200, { data: await withCustomer(ticket) }); return; }
      if (method === "PUT") {
        const body = await parseJsonBody<TicketPayload>(req);
        const customerRows = await q<RowDataPacket>("SELECT id FROM customers");
        const errors = validateTicketPayload(body, customerRows as { id: string }[]);
        if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
        sendJson(res, 200, { data: await withCustomer(await updateTicket(ticket.id, body)) });
        return;
      }
      if (method === "DELETE") { await deleteTicket(ticket.id); sendJson(res, 200, { success: true }); return; }
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Labour
  const ticketLabourMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/labour$/i);
  if (ticketLabourMatch && method === "POST") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketLabourMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const body = await parseJsonBody<Partial<LabourLogPayload>>(req);
      const errors = validateLabourLogPayload(body);
      if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
      await addLabourLog(ticket.id, body as LabourLogPayload);
      sendJson(res, 201, { data: await withCustomer((await getTicketById(ticket.id))!) });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  const ticketLabourEntryMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/labour\/([a-z0-9-]+)$/i);
  if (ticketLabourEntryMatch) {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketLabourEntryMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      if (method === "PUT") {
        const body = await parseJsonBody<Partial<UpdateLabourLogPayload>>(req);
        const errors = validateLabourLogPayload(body);
        if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
        const updated = await updateLabourLog(ticket.id, ticketLabourEntryMatch[2], body as UpdateLabourLogPayload);
        if (!updated) { sendJson(res, 404, { error: "Labour log entry not found" }); return; }
        sendJson(res, 200, { data: await withCustomer((await getTicketById(ticket.id))!) });
        return;
      }
      if (method === "DELETE") {
        await deleteLabourLog(ticket.id, ticketLabourEntryMatch[2]);
        sendJson(res, 200, { data: await withCustomer((await getTicketById(ticket.id))!) });
        return;
      }
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Parts
  const ticketPartsMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/parts$/i);
  if (ticketPartsMatch && method === "POST") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketPartsMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const body = await parseJsonBody<Partial<TicketPartPayload>>(req);
      const inventoryItemId = trimValue(body.inventoryItemId);
      const quantity = parseNumberValue(body.quantity);
      if (!inventoryItemId) { sendJson(res, 400, { error: "Validation failed", details: ["Field 'inventoryItemId' is required"] }); return; }
      if (quantity === null || quantity <= 0 || !Number.isInteger(quantity)) { sendJson(res, 400, { error: "Validation failed", details: ["Field 'quantity' must be a whole number > 0"] }); return; }
      const item = await getInventoryItemById(inventoryItemId);
      if (!item) { sendJson(res, 404, { error: "Inventory item not found" }); return; }
      if (item.quantity < quantity) { sendJson(res, 400, { error: "Insufficient stock", details: [`Only ${item.quantity} unit(s) available`] }); return; }
      await addTicketPart(ticket.id, item, quantity);
      sendJson(res, 201, { data: await withCustomer((await getTicketById(ticket.id))!) });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  const ticketPartEntryMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/parts\/([a-z0-9-]+)$/i);
  if (ticketPartEntryMatch && method === "DELETE") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketPartEntryMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const removed = await removeTicketPart(ticket.id, ticketPartEntryMatch[2]);
      if (!removed) { sendJson(res, 404, { error: "Part entry not found" }); return; }
      sendJson(res, 200, { data: await withCustomer((await getTicketById(ticket.id))!) });
    } catch (error) { sendJson(res, 500, { error: (error as Error).message }); }
    return;
  }

  // Ticket status
  const ticketStatusMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/status$/i);
  if (ticketStatusMatch && method === "PATCH") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketStatusMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const body = await parseJsonBody<Partial<UpdateStatusInput>>(req);
      if (!body.status || !VALID_STATUSES.includes(body.status)) { sendJson(res, 400, { error: "Validation failed", details: [`Field 'status' must be one of: ${VALID_STATUSES.join(", ")}`] }); return; }
      sendJson(res, 200, { data: await withCustomer(await updateTicketStatus(ticket.id, body.status)) });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  // Ticket contact email
  const ticketEmailMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/contact-email$/i);
  if (ticketEmailMatch && method === "PATCH") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    try {
      const ticket = await getTicketById(ticketEmailMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const body = await parseJsonBody<Partial<UpdateContactEmailInput>>(req);
      const correspondenceEmail = trimValue(body.correspondenceEmail);
      if (!correspondenceEmail || !/^\S+@\S+\.\S+$/.test(correspondenceEmail)) { sendJson(res, 400, { error: "Validation failed", details: ["Field 'correspondenceEmail' must be a valid email address"] }); return; }
      await pool.execute("UPDATE tickets SET correspondence_email=?, updated_at=? WHERE id=?", [correspondenceEmail, nowIso(), ticket.id]);
      sendJson(res, 200, { data: await withCustomer((await getTicketById(ticket.id))!) });
    } catch (error) { sendJson(res, 400, { error: (error as Error).message }); }
    return;
  }

  // Send email
  const ticketSendEmailMatch = pathname.match(/^\/api\/tickets\/([a-z0-9-]+)\/email$/i);
  if (ticketSendEmailMatch && method === "POST") {
    if (!pool) { sendJson(res, 503, { error: "Database not configured" }); return; }
    if (!smtpTransporter) { sendJson(res, 503, { error: "Email delivery is not configured", details: ["Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and SMTP_FROM"] }); return; }
    try {
      const ticket = await getTicketById(ticketSendEmailMatch[1]);
      if (!ticket) { sendJson(res, 404, { error: "Ticket not found" }); return; }
      const body = await parseJsonBody<Partial<SendTicketEmailPayload>>(req);
      const errors = validateSendTicketEmailPayload(body);
      if (errors.length > 0) { sendJson(res, 400, { error: "Validation failed", details: errors }); return; }
      const to = trimValue(body.to) || ticket.correspondenceEmail;
      if (!to || !/^\S+@\S+\.\S+$/.test(to)) { sendJson(res, 400, { error: "Validation failed", details: ["Ticket has no valid correspondence email"] }); return; }
      await smtpTransporter.sendMail({ from: SMTP_FROM, to, subject: trimValue(body.subject), text: trimValue(body.body) });
      sendJson(res, 200, { success: true, to });
    } catch (error) { sendJson(res, 500, { error: `Email send failed: ${(error as Error).message}` }); }
    return;
  }

  notFound(res);
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.listen(PORT, () => {
    console.log(`Fixsmith Tickets listening on port ${PORT}`);
  });
}

void start();
