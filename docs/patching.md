# Patch Management

Structured patching for Windows devices: OS updates via the Windows Update
Agent (WUA) and third-party applications via winget.

## How it works

1. **Scan** — the dashboard queues a `patchscan` command; the agent picks it up
   on its next heartbeat (≤30s). The agent queries WUA
   (`IsInstalled=0 and IsHidden=0`) and `winget upgrade`, plus the
   pending-reboot registry keys, and reports one JSON snapshot.
2. **Intake** — `src/lib/patching.ts#ingestPatchScan` upserts catalog rows
   (`Patch`) and reconciles per-device state (`DevicePatchStatus`):
   present → `MISSING`; absent after an install → `INSTALLED`; absent
   otherwise → `RESOLVED`. In-flight (`INSTALLING`/`REBOOT_PENDING`) and
   `FAILED` states are preserved across scans.
3. **Install** — the Patching tab on a device posts selected status ids to
   `/api/devices/[id]/patches/install`, which dispatches
   `patchinstall {"updateIds":[...],"wingetIds":[...]}`. The agent installs
   exactly that subset (WUA batch + one winget process per package) and
   reports per-item results; `applyPatchInstallResult` maps them back to
   statuses (`INSTALLED`, `REBOOT_PENDING`, or `FAILED` with the error).
4. A follow-up scan confirms reality (state only reaches `INSTALLED` for a
   rebooting patch once it stops appearing as missing).

## Endpoints

- `GET  /api/devices/[id]/patches` — statuses + summary counts
- `POST /api/devices/[id]/patches/scan` — queue a scan (dedupes if one is
  already pending)
- `POST /api/devices/[id]/patches/install` — body `{ statusIds: string[] }`

## Notes & limitations (v1)

- Windows only; other platforms report `supported:false` and the tab shows a
  notice. Scans on non-Windows are harmless.
- winget under LocalSystem: the agent resolves
  `C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_*` directly
  since the per-user PATH alias doesn't exist for SYSTEM. Devices without
  winget (e.g. Server 2019) degrade to WUA-only (`wingetAvailable:false`).
- `winget upgrade` has no stable JSON output; the agent parses the fixed-width
  table (unit-tested in `internal/patch/patch_test.go`).
- Failed installs raise the existing `COMMAND_FAILED` alert and keep the error
  on the row (`lastError`, attempt count).
- Apply the schema with `npm run db:push` (new models `Patch`,
  `DevicePatchStatus`; new `Device` columns `rebootPending`,
  `lastPatchScanAt`). Agents must be rebuilt/redeployed to understand
  `patchscan` / `patchinstall`.

## Next (per roadmap)

Policies with auto-approval + soak delays, maintenance windows (shared
primitive), scheduled scans, per-company compliance rollup, Overview widget.
