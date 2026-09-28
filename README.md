# Fixsmith RMM

Remote monitoring and management for a small IT shop: an agent on each managed
machine, a web dashboard to monitor and control them, and a companion ticketing
app.

## Components

| Directory | What it is | Stack |
|---|---|---|
| [`RMM-Dashboard/`](RMM-Dashboard) | The web dashboard and API: devices, metrics, alerts, remote terminal/desktop/files, scripts, scheduling, backups, HTTP monitors, vault, web security recon, users and audit log. | Next.js 16, Prisma, PostgreSQL |
| [`RMM-Agent/`](RMM-Agent) | The endpoint agent (Windows, Linux, macOS). Sends heartbeats and metrics, runs commands, and serves remote sessions over the relay. | Go |
| [`RMM-Mobile/`](RMM-Mobile) | Phone agent that enrolls a phone as a managed device. | Expo / React Native |
| [`Fixsmith-Tickets/`](Fixsmith-Tickets) | Repair ticketing, invoices and inventory. Shares the dashboard's login. | Node, MySQL |
| [`Remote Error Check/`](Remote%20Error%20Check) | Standalone scheduled checker that reports errors from remote HTTP endpoints. | Node |

## How the pieces connect

- Agents enroll with `POST /api/agent/register` using `AGENT_REGISTRATION_SECRET`
  and receive a per-device API key. The dashboard stores only a hash of it.
- Agents send heartbeats and metrics to `POST /api/agent/heartbeat` and pick up
  queued commands in the response.
- Interactive sessions (terminal, remote desktop, file manager) go through the
  WebSocket relay built into the dashboard's custom server (`RMM-Dashboard/server.ts`):
  agents connect to `/ws/agent`, browsers to `/ws/client`. This needs a
  long-running Node process, so it doesn't work on serverless hosts.
- Background jobs run in the same process: backup scheduler, HTTP monitors,
  scheduled tasks, offline detection and data retention.
- Tickets verifies the dashboard's session cookie, so both apps must share `JWT_SECRET`.

## Running it

- **Self-hosting with Docker:** [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)
- **Moving an existing install to your own server:** [`docs/DEPLOY-TO-SERVER.md`](docs/DEPLOY-TO-SERVER.md)
- **cPanel:** [`RMM-Dashboard/CPANEL_DEPLOYMENT.md`](RMM-Dashboard/CPANEL_DEPLOYMENT.md)
- **End-to-end test checklist:** [`docs/TESTING.md`](docs/TESTING.md)

Required dashboard settings in production:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | At least 32 random characters (`openssl rand -base64 32`). The server won't start without it. |
| `AGENT_REGISTRATION_SECRET` | Agents need it to enroll. Registration is refused while it's unset. |
| `DASHBOARD_PASSWORD` | Bootstrap login, only until the first admin account exists. |
| `VAULT_KEY` | Recommended: a base64 32-byte key for vault and 2FA secrets. Otherwise derived from `JWT_SECRET`. |

See `RMM-Dashboard/.env.example` for the optional integrations (S3 backups,
alert webhook, agent auto-update, retention windows).

## Development

```bash
cd RMM-Dashboard
npm install
cp .env.example .env      # point DATABASE_URL at a local Postgres
npx prisma migrate deploy
npm run dev               # http://localhost:3000
npm test && npm run lint && npx tsc --noEmit
```

```bash
cd RMM-Agent
go test ./...
```

CI (`.github/workflows/ci.yml`) runs the agent build and tests for Linux and
Windows, and lint, typecheck and tests for the dashboard, and typechecks Tickets.
