# Fixsmith RMM — Test Plan

Work top to bottom. **Dashboard** items need only the web app; **Endpoint** items
need a Windows machine running the v1.1.0 agent. Tick each as you go.

## 0. Prerequisites
- [ ] Dashboard reachable over **HTTPS** (the agent refuses plain `http://` except localhost).
- [ ] One Windows endpoint reimaged with the **v1.1.0 USB package** (run `windows\install.ps1` elevated).
- [ ] Env set on the dashboard: `DATABASE_URL`, `JWT_SECRET`, `DASHBOARD_PASSWORD`, `AGENT_REGISTRATION_SECRET`. Optional: `AWS_*` (S3 backups), `ALERT_WEBHOOK_URL` (notifications), `AGENT_LATEST_VERSION` + `AGENT_DOWNLOAD_URL_WINDOWS` (auto-update), `RETAIN_*_DAYS`.

## 1. Agent install & registration  (Endpoint)
- [ ] `Get-Service RMMAgent` shows **Running**.
- [ ] `icacls "C:\ProgramData\RMMAgent\config.json"` shows only SYSTEM + Administrators.
- [ ] Device appears in the dashboard **Devices** list within ~30s, marked **Online**.
- [ ] CPU/RAM/Disk metrics populate on the device page and update.
- [ ] **TLS guard:** temporarily run `rmm-agent.exe -url http://example.com` in a console → it refuses with a TLS error. (Don't keep this; the service uses the configured https URL.)

## 2. Remote access  (Endpoint, user logged in)
- [ ] **Remote Desktop** shows the real screen (not black, not zoomed), mouse tracks correctly.
- [ ] **Terminal** runs a command (e.g. `whoami`) and returns output.
- [ ] **Files**: navigate folders; **right-click** a file → Open/Download, Cut, Copy, Rename, Copy path, Delete, Properties; right-click empty space → New Folder, Paste, Upload, Refresh. Copy a file then Paste into another folder (exercises the agent `FILES_COPY`).
- [ ] **Tray icon** visible in the notification area (under the `^`) while logged in.

## 3. Backups  (Endpoint)
- [ ] Device → Backups → **create a Local job** (a source path), **Run Now** → run shows **Completed** with file/byte counts.
- [ ] **Edit** the job (change sources / exclude) and save; re-run reflects the change.
- [ ] Add a **schedule**; confirm `nextRunAt` and that it runs when due.
- [ ] If using S3: create an **S3 job** (bucket/region), run it → archive lands in the bucket; the stored location has no signature.
- [ ] **Backup overview** (`/backups`) lists the runs.

## 4. Virus scan  (Endpoint, Windows)
- [ ] Device page → **Virus Scan → Quick scan** → a `Completed` command appears in the **Commands** tab with Defender output.
- [ ] Audit Log records a `device.scan` entry.

## 5. Companies / grouping  (Dashboard)
- [ ] Companies → create a company; assign the device to it.
- [ ] Devices page now groups the device under that company.
- [ ] Company → **Run command** (terminal icon) → enter `hostname` → dispatched to online devices; output shows in each device's Commands tab.

## 6. Monitoring  (Dashboard + Endpoint)
- [ ] Create a **server monitor** for a public URL (e.g. `https://example.com`) → shows **Up** with latency after a check.
- [ ] **Check now** forces an immediate result.
- [ ] Point a monitor at a bad URL → flips to **Down**; if `ALERT_WEBHOOK_URL` set, a "Monitor down" webhook fires; recovery fires "Monitor recovered".
- [ ] Create an **agent monitor** (Run from: a device) targeting an internal URL the LAN can reach → result comes back via that agent.

## 7. Scripts  (Dashboard + Endpoint)
- [ ] Scripts → create a PowerShell script (e.g. `Get-Date`).
- [ ] **Run** on a single device → output in the device's Commands tab.
- [ ] Run on a **company** → dispatched to all online members.

## 8. Inventory  (Endpoint, Windows)
- [ ] Device → **Inventory** tab → **Scan** software → list of installed programs appears.
- [ ] **Check** updates → pending Windows updates count + list (can take a minute).

## 9. Users & roles  (Dashboard)
- [ ] Log in with the bootstrap `DASHBOARD_PASSWORD` (blank username) → you're **admin**.
- [ ] Users page → create an **admin** and a **tech** account.
- [ ] Log in as the **tech** → no Users/Audit links; hitting `/users` or `/api/users` returns "Admin access required".
- [ ] Log in as the **admin** → Users/Audit visible.

## 10. Audit log  (Dashboard, admin)
- [ ] Audit Log shows entries for logins, commands/scans, user changes, deletes, script runs.

## 11. Notifications  (Dashboard)
- [ ] With `ALERT_WEBHOOK_URL` set (Slack/Discord/custom), trigger a failed command (e.g. run `exit 1`) → a "COMMAND FAILED" message arrives.

## 12. Auto-update  (Endpoint, Windows)  — optional
- [ ] Set `AGENT_LATEST_VERSION` higher than installed (e.g. `1.2.0`) and `AGENT_DOWNLOAD_URL_WINDOWS` to a reachable `rmm-agent.exe`.
- [ ] Within ~6h (or restart the service to check sooner) the agent downloads, swaps, and restarts; the device reports the new version. **Test on a spare machine first.**

## 13. Retention  (Dashboard)
- [ ] After the daily job runs (or restart the dashboard), rows older than the `RETAIN_*_DAYS` windows are gone. Defaults: metrics/checks 30d, backup runs 180d, audit 365d.

## 14. CI / release  (GitHub)
- [ ] Open a trivial PR → the **CI** workflow runs agent (linux+windows) + dashboard (lint+typecheck) green.
- [ ] Push a tag `vX.Y.Z` → the **Release** workflow builds and attaches the USB package + per-OS binaries to a draft release.
