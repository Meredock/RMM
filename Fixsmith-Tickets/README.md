# Fixsmith Repair Centre

Local TypeScript HTTPS app for a repair centre. It includes a browser GUI plus in-memory APIs for tickets, customers, and inventory so you can develop the workflow without database setup.

## Prerequisites

- Node.js 20+

## Scripts

- `npm run dev`: Run directly from TypeScript source.
- `npm run build`: Compile TypeScript to `dist/`.
- `npm run start`: Run compiled output.

## Quick Start

1. Install dependencies:
   `npm install`
2. Run dev mode:
   `npm run dev`
3. Build and start:
   `npm run build && npm run start`

Base URL: `https://localhost:3443`

GUI URLs:

- `https://localhost:3443/dashboard`
- `https://localhost:3443/tickets`

## Endpoints

- `GET /health`
- `GET /api/dashboard`
- `GET|POST /api/customers`
- `GET|PUT|DELETE /api/customers/:id`
- `GET|POST /api/tickets`
- `GET|PUT|DELETE /api/tickets/:id`
- `PATCH /api/tickets/:id/status`
- `PATCH /api/tickets/:id/contact-email`
- `POST /api/tickets/:id/email`
- `GET|POST /api/inventory`
- `GET|PUT|DELETE /api/inventory/:id`

## SMTP Email Setup

To send correspondence and invoice emails directly from the ticket detail page, configure these environment variables before running:

- `SMTP_HOST`
- `SMTP_PORT` (for example `587`)
- `SMTP_SECURE` (`true` or `false`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

PowerShell example:

`$env:SMTP_HOST="smtp.office365.com"; $env:SMTP_PORT="587"; $env:SMTP_SECURE="false"; $env:SMTP_USER="you@domain.com"; $env:SMTP_PASS="your-app-password"; $env:SMTP_FROM="you@domain.com"; npm run dev`

## GUI Workflow

1. Open `https://localhost:3443/app`
2. Use the `Tickets` section to create, edit, delete, and reassign repair tickets
3. Use the `Customers` section to manage organisations and contact details
4. Use the `Inventory` section to manage stock items and reorder thresholds
5. Refresh to view updated metrics and queue health

## Command Examples (PowerShell 5.1 Compatible)

List customers:

`curl.exe -k https://localhost:3443/api/customers`

List tickets:

`curl.exe -k https://localhost:3443/api/tickets`

List inventory:

`curl.exe -k https://localhost:3443/api/inventory`

Update ticket status (replace TICKET_ID):

`curl.exe -k -X PATCH https://localhost:3443/api/tickets/TICKET_ID/status -H "Content-Type: application/json" -d "{\"status\":\"ready\"}"`

Notes:

- Customer deletion is blocked while tickets still reference that customer.
- Data is stored in memory only, so restarting the server resets tickets, customers, and inventory.

## Debug

- Use the VS Code launch configuration "Debug Fixsmith" (or press F5) to run under the debugger.
