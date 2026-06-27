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

## Phase 4 — Migrate the GoDaddy website (static / PHP)

**Only start this once the RMM dashboard is live and you're comfortable.** Same
safety rule: nothing changes for visitors until you flip that site's DNS at the end.

**4a. Get the site files off GoDaddy.** In GoDaddy's cPanel → **File Manager**,
zip your site's document root (usually `public_html`) and download it — or use
**FTP** (FileZilla). If the site uses a **MySQL database**, also export it: cPanel
→ **phpMyAdmin** → select the DB → **Export** → Quick → download the `.sql`.

**4b. Put the files on the server** (e.g. `~/RMM/site/`) and run them in a
container. Create `~/RMM/docker-compose.site.yml`:
```yaml
services:
  website:
    image: php:8.2-apache        # serves both plain HTML and PHP
    restart: unless-stopped
    volumes:
      - ./site:/var/www/html     # your copied files
    ports:
      - "127.0.0.1:8080:80"
  # Uncomment if the site needs MySQL:
  # site-db:
  #   image: mysql:8
  #   restart: unless-stopped
  #   environment:
  #     MYSQL_DATABASE: sitedb
  #     MYSQL_USER: site
  #     MYSQL_PASSWORD: changeme
  #     MYSQL_ROOT_PASSWORD: changeme-root
  #   volumes:
  #     - site-db:/var/lib/mysql
# volumes:
#   site-db:
```
Start it: `docker compose -f docker-compose.site.yml up -d`. If you have a DB,
import it: `docker compose -f docker-compose.site.yml exec -T site-db mysql -usite -pchangeme sitedb < yoursite.sql` (and update the site's DB host to `site-db`).

**4c. nginx + HTTPS + DNS** — same pattern as the dashboard: an nginx vhost for
the website's domain proxying to `http://127.0.0.1:8080`, `certbot --nginx -d
yoursite.com`, then point that domain's DNS A record at `157.250.207.30`.

---

## Phase 5 — Migrate the tickets app (Node + MySQL, from Railway)

The ticketing code is in its own GitHub repo, so the steps depend on its exact
setup. **What I need from you to write the precise Dockerfile + compose:** the
repo name, and its `package.json` (specifically the `start`/`build` scripts), the
port it listens on, and the env vars it expects. The shape will be:
```yaml
# docker-compose.tickets.yml
services:
  tickets-db:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: tickets
      MYSQL_USER: tickets
      MYSQL_PASSWORD: ${TICKETS_DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${TICKETS_DB_ROOT}
    volumes:
      - tickets-db:/var/lib/mysql
  tickets:
    build: ./tickets            # the tickets repo cloned in here
    restart: unless-stopped
    depends_on: [tickets-db]
    environment:
      DATABASE_URL: mysql://tickets:${TICKETS_DB_PASSWORD}@tickets-db:3306/tickets
      # ...the app's other env vars
    ports:
      - "127.0.0.1:8090:3000"   # adjust to the app's real port
volumes:
  tickets-db:
```
Migrate its data the same way: export the Railway MySQL (`mysqldump`) and import
into the `tickets-db` container, then nginx vhost + certbot + DNS for the tickets
domain. **Send me the repo name and I'll fill this in exactly.**

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
