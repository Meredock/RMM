# cPanel Deployment

This is an **optional, self-contained path** for running the dashboard on a
cPanel host (e.g. Synergy Wholesale), the same way the tickets app is hosted.
It does not replace or affect the existing Render deployment — Render keeps
starting via `tsx server.ts` (see `render.yaml`), and nothing here changes that.
Adopt this only when you decide to move; until then it just sits alongside.

This dashboard must run as a Node.js application, not as static hosting. The agent APIs and remote tools use:

- HTTP routes under `/api/agent/*`
- WebSocket relay routes at `/ws/agent` and `/ws/client`
- PostgreSQL through Prisma

## Two things to confirm with your host before committing

The tickets app was an easy cPanel target (plain MySQL + short-lived HTTP
requests). The dashboard has two extra requirements — confirm both with Synergy
Wholesale before migrating:

1. **PostgreSQL.** Prisma is configured for PostgreSQL, not MySQL. cPanel plans
   commonly offer MySQL/MariaDB only. If your plan has PostgreSQL (or you can
   point `DATABASE_URL` at an external/VPS Postgres reachable from the cPanel
   server), the app runs as-is. If it is MySQL-only, that is a bigger change: the
   Prisma provider and any Postgres-specific column types would need porting —
   don't attempt that until you've decided to commit.
2. **WebSocket upgrades.** Terminal, Files, and Remote Desktop rely on a
   persistent WebSocket relay. Passenger supports WebSocket passthrough, but some
   shared plans throttle or drop idle upgrades. Device heartbeats (plain HTTP)
   work regardless; only the live remote tools depend on WebSockets staying up.

## Requirements

- cPanel with **Setup Node.js App** support.
- Node.js 20 or newer.
- PostgreSQL reachable from the cPanel server.
- WebSocket upgrade support on the hosting plan or proxy.

Shared cPanel plans sometimes disable or break WebSocket upgrades. If `/ws/agent` cannot stay connected, device heartbeats may still work but Terminal, Files, and Remote Desktop will fail.

## Database

Your local Docker PostgreSQL is fine for local development, but cPanel will not be able to reach `localhost` on your PC. For hosting, use one of these:

- PostgreSQL provided by the hosting account, if available.
- A managed external PostgreSQL service.
- A VPS-hosted PostgreSQL instance with firewall rules allowing the cPanel server only.

Set `DATABASE_URL` to the hosted database connection string.

## Upload

Upload the dashboard project files to the cPanel application directory. Do not upload these directories:

- `node_modules`
- `.next`

Keep these files:

- `package.json`
- `package-lock.json`
- `passenger.js` (the cPanel/Passenger startup file)
- `server.ts`
- `src/`
- `prisma/`
- `next.config.ts`
- `tsconfig.json`
- Tailwind/PostCSS config files

## cPanel Node App

In cPanel, create a Node.js app with:

- Application root: the uploaded dashboard directory
- Application startup file: `passenger.js`
- Application mode: production
- Node.js version: 20+

`passenger.js` is a small shim that registers the `tsx` require-hook and then
loads `server.ts` (the custom server that runs Next.js plus the WebSocket relay
and schedulers). Passenger loads a startup *file* directly with Node and cannot
run `tsx server.ts` or an npm script, so the app must point at `passenger.js`,
**not** `server.ts` — Node cannot parse TypeScript on its own.

If cPanel asks for a startup command instead of a file, use:

```sh
npm run cpanel:start
```

which runs `node passenger.js` in production mode.

## Environment Variables

Add these in cPanel's Node.js app environment settings:

```sh
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=postgresql://user:password@host:5432/rmm_dashboard
JWT_SECRET=replace-with-a-long-random-secret
DASHBOARD_PASSWORD=replace-with-a-strong-password
AGENT_REGISTRATION_SECRET=replace-with-a-long-random-secret
```

cPanel usually injects `PORT`; do not hard-code it unless your host tells you to.

## Install And Build

From cPanel's terminal or Node app tool:

```sh
npm ci
npm run cpanel:build
npm run db:push
```

Then restart the Node.js app.

## Agent Configuration

Agents must point at the public dashboard URL, for example:

```json
{
  "dashboard_url": "https://rmm.example.com",
  "registration_secret": "same-value-as-AGENT_REGISTRATION_SECRET",
  "device_name": "",
  "interval_seconds": 30
}
```

Do not use `localhost` in deployed agent configs unless the agent is running on the same server as the dashboard.

## Verification

1. Open the dashboard URL and log in.
2. Register or restart one agent.
3. Confirm the device appears online.
4. Open Terminal, Files, or Remote Desktop.

If the device is online but remote tools say `Agent not connected`, the HTTP heartbeat is working but the WebSocket relay is not. Check:

- The dashboard is running through `server.ts`, not `next start` or static hosting.
- The host/proxy supports WebSocket upgrades.
- The agent can reach `wss://your-domain/ws/agent` or `ws://your-domain/ws/agent`.
- Only one dashboard process is serving the domain, because relay connections are stored in process memory.
