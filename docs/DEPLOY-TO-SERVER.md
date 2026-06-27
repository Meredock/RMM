# Deploying the RMM suite to your server (157.250.207.30)

Beginner-friendly, **phased** guide. Read the "How this works" box first — it's
the part that keeps you from getting overwhelmed.

> ### How this works (read this)
> - **Nothing you have now breaks until the very last step.** You build and test
>   everything on the new server first. Render, Railway and GoDaddy keep running
>   untouched. The only moment anything "switches over" is when *you* change a DNS
>   record at the end — and you can change it back in minutes if needed.
> - **Only the *dashboard* moves to the server.** Your agents stay installed on
>   client PCs exactly as they are; they just talk to the same web address, which
>   you'll repoint to the new server at the end.
> - **Do one phase, confirm it works, then do the next.** Don't rush ahead.

---

## Phase 0 — Install Docker on the server (one time, ~5 min)

SSH in:
```bash
ssh youruser@157.250.207.30
```
Install Docker (works on Ubuntu/Debian; this is the official script):
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER          # lets you run docker without sudo
```
Log out and back in (so the group change applies), then check it works:
```bash
docker run --rm hello-world            # should print "Hello from Docker!"
docker compose version                 # should print a version number
```
✅ If both worked, Docker is ready.

---

## Phase 1 — Get the dashboard running on the server (not public yet)

```bash
cd ~
git clone https://github.com/Meredock/RMM.git
cd RMM
cp .env.docker.example .env
nano .env
```
Fill these in `.env` (save in nano: Ctrl-O, Enter, Ctrl-X):
- `DASHBOARD_DOMAIN` — the address you'll use, e.g. `dashboard.fixsmith.com.au`
- `POSTGRES_PASSWORD` — make one up (letters/numbers)
- `JWT_SECRET` — run `openssl rand -base64 32` and paste the output
- `DASHBOARD_PASSWORD` — your login password
- `AGENT_REGISTRATION_SECRET` — **must match your current one** if you migrate data
  (see Phase 3); otherwise run `openssl rand -base64 32`
- `VAULT_KEY` — `openssl rand -base64 32` (the credential-vault key; never change it later)

Because your server already runs **nginx**, start the stack **without** the
built-in Caddy (it would fight nginx for ports 80/443):
```bash
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build
```
First build takes a few minutes. Then check it's alive:
```bash
docker compose logs -f dashboard
```
Wait for `> Ready on http://0.0.0.0:3000` (Ctrl-C to stop watching logs). The
dashboard is now running on the server at `127.0.0.1:3000` — only reachable on
the server itself for now. ✅

---

## Phase 2 — Put it behind nginx with HTTPS

You need a **temporary** web address to test before touching your real domain.
Easiest: pick a spare subdomain you can point at the server now without affecting
anything, e.g. `rmm-test.fixsmith.com.au` → A record → `157.250.207.30`.

Create the nginx site (the repo ships an example):
```bash
sudo cp ~/RMM/docs/nginx-rmm.conf.example /etc/nginx/sites-available/rmm
sudo nano /etc/nginx/sites-available/rmm      # set server_name to your test (or real) domain
sudo ln -s /etc/nginx/sites-available/rmm /etc/nginx/sites-enabled/rmm
sudo nginx -t                                  # must say "syntax is ok"
sudo systemctl reload nginx
sudo certbot --nginx -d rmm-test.fixsmith.com.au   # free HTTPS cert
```
> If `nginx -t` complains about a **duplicate `connection_upgrade` map**, delete
> the `map { ... }` block at the top of the rmm file — your nginx already has one.

Now open `https://rmm-test.fixsmith.com.au` in a browser → you should get the
login page. Log in with `DASHBOARD_PASSWORD`. ✅ The suite is fully running on
your server (fresh, empty database for now).

---

## Phase 3 — Move your data and go live

This is the only step that changes what your clients/agents see. Do it when
you're happy with Phase 2.

**3a. Copy your data from Render** (keeps all devices, history, vault, etc.):
```bash
# On any machine that can reach Render's DB (get the External Database URL from
# the Render dashboard → your Postgres → "External Database URL"):
pg_dump "<RENDER_EXTERNAL_DATABASE_URL>" --no-owner --no-privileges -Fc -f rmm.dump
# Copy rmm.dump up to the server (scp), then load it:
docker compose cp rmm.dump db:/tmp/rmm.dump
docker compose exec db pg_restore -U rmm -d rmm --clean --no-owner /tmp/rmm.dump
```

**3b. Point your real domain at the server.** In GoDaddy DNS for
`dashboard.fixsmith.com.au`, change its **A record** to `157.250.207.30`. Update
`server_name` in the nginx file to the real domain and re-run the `certbot`
line for it.

**That's the switch.** Within a few minutes:
- Your dashboard loads at its normal address, now served from your friend's box.
- **Agents reconnect on their own** — they use the same web address and the same
  API keys (which came over in the data copy). No reinstalling.

If anything looks wrong, change the GoDaddy A record back to Render's address and
you're instantly back to how it was.

---

## Phase 4 — The other things (do later, one at a time)

You don't need these to get the RMM suite live. Tackle them separately so you
don't overload yourself:

- **Tickets app (currently Railway/MySQL).** It lives in a *different* repo, so
  it's not in this compose yet. When you're ready, tell me and I'll add a
  `tickets` + `mysql` service to the same Docker stack the same way — then it
  runs alongside the dashboard on the one server.
- **GoDaddy website.** "Webhosting on GoDaddy" usually means one of two things —
  tell me which and I'll write the matching steps:
  1. **GoDaddy is just your domain/DNS** (no website there) → nothing to migrate;
     you only change DNS records (which Phase 3 already does).
  2. **GoDaddy hosts an actual website** (cPanel/WordPress/HTML) → that's a
     separate move: copy the site files + any database, run it as another
     container (e.g. nginx/PHP or WordPress) behind the same nginx, then point
     that domain's DNS at the server.

---

## Handy commands
```bash
cd ~/RMM
docker compose -f docker-compose.yml -f docker-compose.nginx.yml logs -f dashboard   # logs
docker compose -f docker-compose.yml -f docker-compose.nginx.yml ps                  # status
git pull && docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build   # update to latest
docker compose -f docker-compose.yml -f docker-compose.nginx.yml down                # stop (data is kept)
```
Your data is safe in Docker **volumes** (`db-data`); `down` does not delete it.
Back it up with `docker compose exec db pg_dump -U rmm rmm > backup.sql`.
