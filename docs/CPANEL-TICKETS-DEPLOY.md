# Auto-deploy Tickets to cPanel

The tickets app deploys itself to cPanel (Synergy Wholesale) on every push to
`main` that touches `Fixsmith-Tickets/**`. GitHub Actions builds it on the
runner and ships only the runtime artifacts to your server over SSH, then
reloads Passenger. Your source of truth stays the Git repo; the server is just
a deploy target that gets refreshed automatically.

Workflow: `.github/workflows/deploy-tickets.yml`.

## How it works

1. You push a tickets change to `main`.
2. The runner runs `npm ci`, `npm run build` (TypeScript → `dist/`), then
   `npm prune --omit=dev` so `node_modules/` is production-only.
3. It rsyncs `dist/`, `node_modules/`, `public/`, `migrations/`,
   `package.json`, and `package-lock.json` to your cPanel app directory.
4. It `touch`es `tmp/restart.txt`, which tells Passenger to reload on the next
   request. The tickets app auto-applies `migrations/001_init.sql` on startup.

Your server's `.env` (DB URL, `JWT_SECRET`, SMTP) is **never** uploaded or
deleted, so secrets and config survive every deploy.

## One-time setup

### 1. Confirm you have SSH access

Synergy Wholesale cPanel plans usually include SSH. In cPanel, open
**SSH Access** (or **Terminal**). If it's there, you're set. Note the **SSH
port** — shared cPanel servers often use a non-standard port, not 22. It's shown
in SSH Access, or ask Synergy support.

If your plan has no SSH, use the manual fallback at the bottom instead.

### 2. Create a dedicated deploy key

Generate a new key pair just for deploys (don't reuse a personal key):

```sh
ssh-keygen -t ed25519 -f tickets_deploy -C "github-actions tickets deploy" -N ""
```

This makes `tickets_deploy` (private) and `tickets_deploy.pub` (public).

- Put the **public** key on the server: cPanel → **SSH Access** →
  **Manage SSH Keys** → **Import** (paste `tickets_deploy.pub`), then
  **Authorize** it.
- The **private** key (`tickets_deploy`) goes into a GitHub secret (next step).
  Keep it secret; delete the local copies once it's in GitHub.

### 3. Find your app path

In cPanel → **Setup Node.js App**, open the tickets app. The **Application root**
is the path you need (e.g. `/home/YOURUSER/tickets`). That's the Passenger app
directory and also where `tmp/restart.txt` lives.

### 4. Add the GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `CPANEL_SSH_HOST` | Your cPanel server host (e.g. the hostname Synergy gave you) |
| `CPANEL_SSH_PORT` | The SSH port (omit only if it's 22) |
| `CPANEL_SSH_USER` | Your cPanel username |
| `CPANEL_SSH_KEY` | The **private** key contents (the whole `tickets_deploy` file) |
| `CPANEL_TICKETS_PATH` | The Application root path from step 3 |

Until all of `CPANEL_SSH_HOST`, `CPANEL_SSH_USER`, `CPANEL_SSH_KEY`, and
`CPANEL_TICKETS_PATH` are set, the workflow skips deploying with a warning
instead of failing — so merging this before you've configured it is safe.

### 5. Test it

- **Manual run:** repo → **Actions → Deploy Tickets to cPanel → Run workflow**.
  Watch the log; it should build, rsync, and reload.
- **Real run:** make a small tickets change, merge to `main`, and confirm the
  site updates.

The very first deploy still needs the cPanel Node app itself to already exist
(created once via **Setup Node.js App**, startup file `dist/index.js`, with the
`.env` populated). After that, deploys are automatic.

## Security notes

- Use a **dedicated** deploy key, not a personal one, so it can be revoked
  without affecting anything else.
- Anyone who can push to `main` (or approve a PR into it) can trigger a deploy
  to your server — protect `main` accordingly.
- The workflow only ever writes under `CPANEL_TICKETS_PATH`; it never removes
  `.env` or files outside the synced directories.

## Fallback without SSH: cPanel Git™ Version Control

If your plan has no SSH, you can deploy manually from cPanel instead:

1. cPanel → **Git™ Version Control** → **Create** → clone
   `https://github.com/Meredock/RMM` (private repos need a deploy key added to
   GitHub; cPanel's SSH Access can generate one).
2. To update: open the repo in cPanel → **Pull or Deploy → Update from Remote**.
3. Because this app compiles TypeScript, the build must still run on the server
   — run `npm install` and `npm run build` for `Fixsmith-Tickets` via the
   **Setup Node.js App** tools (Run NPM Install / Run JS script), then restart
   the app.

The SSH/Actions path above is preferred: it builds on the runner, so the shared
host never compiles anything and updates are hands-off.
