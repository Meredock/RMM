# Self-hosting Fixsmith RMM (Docker)

This runs the **dashboard + PostgreSQL + Caddy** (automatic HTTPS) on any
Docker-capable server, replacing Render. The agents keep working unchanged as
long as the dashboard stays reachable over **HTTPS** at the same domain.

## Prerequisites
- A server with **Docker** + the **compose** plugin (`docker compose version`).
- A **domain** (e.g. `dashboard.example.com`) with a DNS **A record** pointing
  at the server's public IP.
- Ports **80** and **443** open to the internet (Caddy needs them for the cert).

## Deploy
```bash
git clone https://github.com/Meredock/RMM.git
cd RMM
cp .env.docker.example .env
nano .env            # set DASHBOARD_DOMAIN, POSTGRES_PASSWORD, JWT_SECRET,
                     # DASHBOARD_PASSWORD, AGENT_REGISTRATION_SECRET (+ optionals)
docker compose up -d --build
```
On first start the dashboard container runs `prisma migrate deploy` (creating all
tables) and then launches the server. Caddy obtains a Let's Encrypt certificate
for `DASHBOARD_DOMAIN` automatically.

Visit `https://<DASHBOARD_DOMAIN>` and log in with `DASHBOARD_PASSWORD` (blank
username → bootstrap admin). Create real users under **Users**.

### Useful commands
```bash
docker compose logs -f dashboard     # app logs
docker compose ps                    # status
docker compose up -d --build         # redeploy after pulling new code
docker compose down                  # stop (data persists in named volumes)
```

## Moving your existing data off Render (optional)
If you want to keep current devices/history:
```bash
# From a machine that can reach the Render database:
pg_dump "<RENDER_DATABASE_URL>" --no-owner --no-privileges -Fc -f rmm.dump
# Copy rmm.dump to the server, then load it into the compose DB:
docker compose cp rmm.dump db:/tmp/rmm.dump
docker compose exec db pg_restore -U rmm -d rmm --clean --no-owner /tmp/rmm.dump
```
Run this **after** the stack is up (so the schema/migrations exist), or restore
into a fresh DB and let `migrate deploy` reconcile.

## Pointing agents at the new server
- **Same domain (recommended):** just move the DNS A record for
  `dashboard.fixsmith.com.au` to the new server. Existing agents reconnect with
  no change — their saved API keys still work (if you migrated the database).
- **New domain:** existing agents have the old URL baked into
  `C:\ProgramData\RMMAgent\config.json`. Either keep the old domain, or update
  that file's `dashboard_url` on each endpoint (and restart `RMMAgent`), or
  reinstall from a USB package whose `installer/config.json` points at the new
  domain. **The agent requires `https://`** — Caddy provides it, so don't use a
  bare-IP/http URL.

## Notes
- All data lives in the `db-data` and `caddy-data` Docker volumes; back these up.
- To enable optional features, fill the matching vars in `.env`: `ALERT_WEBHOOK_URL`
  (notifications), `AWS_*` (S3 backups), `AGENT_LATEST_VERSION` +
  `AGENT_DOWNLOAD_URL_WINDOWS` (agent auto-update), `RETAIN_*_DAYS` (retention).
- **Tickets app** (currently Railway/MySQL) lives in a separate repo and isn't
  part of this compose. It can be added as another service (plus a `mysql`
  container) once that repo is alongside this one — ask and I'll wire it in.
