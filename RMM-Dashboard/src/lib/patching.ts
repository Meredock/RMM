import { prisma } from "@/lib/prisma";
import type { PatchSeverity, PatchSource } from "@prisma/client";

// ---------------------------------------------------------------------------
// Agent payload shapes (see RMM-Agent/internal/patch)
// ---------------------------------------------------------------------------

interface WUAUpdate {
  updateId: string;
  title: string;
  severity?: string;
  kb?: string;
  categories?: string[];
  sizeMB?: number;
}

interface WingetUpgrade {
  id: string;
  name?: string;
  current?: string;
  available?: string;
  source?: string;
}

interface ScanPayload {
  platform?: string;
  supported?: boolean;
  rebootPending?: boolean;
  wua?: WUAUpdate[];
  wingetAvailable?: boolean;
  winget?: WingetUpgrade[];
  errors?: string[];
}

interface InstallItemResult {
  kind: "wua" | "winget";
  id: string;
  title?: string;
  result: string; // Succeeded | SucceededWithErrors | Failed | Aborted | NotFound
  error?: string;
}

interface InstallPayload {
  results?: InstallItemResult[];
  rebootRequired?: boolean;
}

function severityFromMsrc(s?: string): PatchSeverity {
  switch ((s ?? "").toLowerCase()) {
    case "critical":
      return "CRITICAL";
    case "important":
      return "IMPORTANT";
    case "moderate":
      return "MODERATE";
    case "low":
      return "LOW";
    default:
      return "UNKNOWN";
  }
}

interface CatalogEntry {
  source: PatchSource;
  externalId: string;
  version: string;
  title: string;
  severity: PatchSeverity;
  category: string | null;
  kb: string | null;
}

function entriesFromScan(scan: ScanPayload): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const u of scan.wua ?? []) {
    if (!u.updateId) continue;
    entries.push({
      source: "WINDOWS_UPDATE",
      externalId: u.updateId,
      version: "",
      title: u.title || u.updateId,
      severity: severityFromMsrc(u.severity),
      category: u.categories?.[0] ?? null,
      kb: u.kb ? u.kb.split(",")[0].trim() || null : null,
    });
  }
  for (const w of scan.winget ?? []) {
    if (!w.id) continue;
    entries.push({
      source: "WINGET",
      externalId: w.id,
      version: w.available ?? "",
      title: w.name || w.id,
      severity: "UNKNOWN",
      category: "Application",
      kb: null,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Scan intake
// ---------------------------------------------------------------------------

// ingestPatchScan reconciles a full scan snapshot into the patch catalog and
// per-device statuses. Snapshots are idempotent: re-ingesting the same scan is
// a no-op beyond timestamps.
export async function ingestPatchScan(deviceId: string, output: string): Promise<void> {
  let scan: ScanPayload;
  try {
    scan = JSON.parse(output);
  } catch {
    return; // unparseable output — leave state untouched
  }

  const now = new Date();

  if (scan.supported === false) {
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastPatchScanAt: now },
    });
    return;
  }

  const entries = entriesFromScan(scan);

  // Upsert catalog rows and remember which patch ids this scan reported.
  const scannedPatchIds = new Set<string>();
  for (const e of entries) {
    const patch = await prisma.patch.upsert({
      where: {
        source_externalId_version: {
          source: e.source,
          externalId: e.externalId,
          version: e.version,
        },
      },
      create: e,
      update: { title: e.title, severity: e.severity, category: e.category, kb: e.kb },
    });
    scannedPatchIds.add(patch.id);
  }

  const existing = await prisma.devicePatchStatus.findMany({
    where: { deviceId },
    select: { id: true, patchId: true, state: true },
  });
  const existingByPatch = new Map(existing.map((s) => [s.patchId, s]));

  // Present in scan → MISSING, unless an install is in flight (INSTALLING /
  // REBOOT_PENDING) or has already failed (keep FAILED so the error stays
  // visible until the next successful install or manual retry).
  for (const patchId of scannedPatchIds) {
    const cur = existingByPatch.get(patchId);
    if (!cur) {
      await prisma.devicePatchStatus.create({
        data: { deviceId, patchId, state: "MISSING", firstSeenAt: now, lastSeenAt: now },
      });
    } else {
      const keep = cur.state === "INSTALLING" || cur.state === "REBOOT_PENDING" || cur.state === "FAILED";
      await prisma.devicePatchStatus.update({
        where: { id: cur.id },
        data: { lastSeenAt: now, ...(keep ? {} : { state: "MISSING" }) },
      });
    }
  }

  // Absent from scan → confirm in-flight installs, resolve the rest.
  for (const cur of existing) {
    if (scannedPatchIds.has(cur.patchId)) continue;
    if (cur.state === "INSTALLED" || cur.state === "RESOLVED") continue;
    const wasInFlight = cur.state === "INSTALLING" || cur.state === "REBOOT_PENDING";
    await prisma.devicePatchStatus.update({
      where: { id: cur.id },
      data: wasInFlight
        ? { state: "INSTALLED", installedAt: now, lastError: null }
        : { state: "RESOLVED" },
    });
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: { rebootPending: !!scan.rebootPending, lastPatchScanAt: now },
  });
}

// ---------------------------------------------------------------------------
// Install-result intake
// ---------------------------------------------------------------------------

async function setStateByExternalId(
  deviceId: string,
  source: PatchSource,
  externalId: string,
  data: { state: "INSTALLED" | "REBOOT_PENDING" | "FAILED"; lastError?: string | null; installedAt?: Date }
) {
  await prisma.devicePatchStatus.updateMany({
    where: { deviceId, patch: { source, externalId } },
    data,
  });
}

// applyPatchInstallResult maps a "patchinstall" command result back onto the
// targeted DevicePatchStatus rows.
export async function applyPatchInstallResult(
  deviceId: string,
  command: string,
  output: string | null,
  failed: boolean
): Promise<void> {
  const now = new Date();

  let parsed: InstallPayload | null = null;
  if (output) {
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = null;
    }
  }

  const rebootRequired = !!parsed?.rebootRequired;

  for (const r of parsed?.results ?? []) {
    if (!r.id) continue;
    const source: PatchSource = r.kind === "winget" ? "WINGET" : "WINDOWS_UPDATE";
    const ok = r.result === "Succeeded" || r.result === "SucceededWithErrors";
    if (ok) {
      await setStateByExternalId(deviceId, source, r.id, {
        state: source === "WINDOWS_UPDATE" && rebootRequired ? "REBOOT_PENDING" : "INSTALLED",
        installedAt: now,
        lastError: r.result === "SucceededWithErrors" ? "Succeeded with errors" : null,
      });
    } else {
      await setStateByExternalId(deviceId, source, r.id, {
        state: "FAILED",
        lastError: (r.error || r.result || "install failed").slice(0, 500),
      });
    }
  }

  // Anything we targeted that is still INSTALLING got no per-item result
  // (agent crash, timeout, unparseable output) — mark it failed rather than
  // leaving it stuck in flight.
  if (failed || !parsed) {
    let req: { updateIds?: string[]; wingetIds?: string[] } = {};
    try {
      req = JSON.parse(command.slice("patchinstall ".length));
    } catch {}
    const targeted = [
      ...(req.updateIds ?? []).map((id) => ({ source: "WINDOWS_UPDATE" as PatchSource, id })),
      ...(req.wingetIds ?? []).map((id) => ({ source: "WINGET" as PatchSource, id })),
    ];
    for (const t of targeted) {
      await prisma.devicePatchStatus.updateMany({
        where: { deviceId, state: "INSTALLING", patch: { source: t.source, externalId: t.id } },
        data: { state: "FAILED", lastError: "Install did not report a result (see Commands tab)" },
      });
    }
  }

  if (rebootRequired) {
    await prisma.device.update({ where: { id: deviceId }, data: { rebootPending: true } });
  }
}
