# Build RMM Agent for all platforms and create USB-deployable package.
# Run from the RMM-Agent directory: .\build.ps1
# Requires Go 1.22+ in PATH.

param(
    [switch]$WindowsOnly,
    [string]$OutDir = "dist\usb-package"
)

$ErrorActionPreference = "Stop"

function Step([string]$msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "  [+] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  RMM Agent Build Script" -ForegroundColor White
Write-Host "  ======================" -ForegroundColor White
Write-Host ""

# ── Find Go binary ────────────────────────────────────────────────────────────
$goExe = "go"
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    # Common install locations on Windows
    $candidates = @(
        "C:\Program Files\Go\bin\go.exe",
        "$env:LOCALAPPDATA\Programs\Go\bin\go.exe",
        "$env:USERPROFILE\go\bin\go.exe"
    )
    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $found) { Write-Error "Go not found in PATH or common locations. Install Go from https://go.dev/dl/" }
    $goExe = $found
}
$goVer = & $goExe version
Ok "Using $goVer"

# ── Prepare output directory ──────────────────────────────────────────────────
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force "$OutDir\windows" | Out-Null
New-Item -ItemType Directory -Force "$OutDir\linux"   | Out-Null
New-Item -ItemType Directory -Force "$OutDir\macos"   | Out-Null

# ── Helper: compile ───────────────────────────────────────────────────────────
function Build([string]$os, [string]$arch, [string]$out) {
    Step "Building $os/$arch -> $out"
    $env:GOOS       = $os
    $env:GOARCH     = $arch
    $env:CGO_ENABLED = "0"

    & $goExe build -ldflags="-s -w" -o $out .
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $os/$arch" }
    $size = [math]::Round((Get-Item $out).Length / 1MB, 1)
    Ok "  $out  ($size MB)"
}

# ── Build Windows (always) ────────────────────────────────────────────────────
Build "windows" "amd64" "$OutDir\windows\rmm-agent.exe"

# ── Build Linux and macOS unless -WindowsOnly ─────────────────────────────────
if (-not $WindowsOnly) {
    Build "linux"  "amd64" "$OutDir\linux\rmm-agent"
    Build "darwin" "amd64" "$OutDir\macos\rmm-agent"
    Build "darwin" "arm64" "$OutDir\macos\rmm-agent-arm64"
}

# Reset env vars
Remove-Item Env:\GOOS        -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH      -ErrorAction SilentlyContinue
Remove-Item Env:\CGO_ENABLED -ErrorAction SilentlyContinue

# ── Copy installer scripts ────────────────────────────────────────────────────
Step "Copying installer scripts..."
Copy-Item "installer\windows\install.ps1"   "$OutDir\windows\"
Copy-Item "installer\windows\uninstall.ps1" "$OutDir\windows\"
Copy-Item "installer\linux\install.sh"      "$OutDir\linux\"
Copy-Item "installer\macos\install.sh"      "$OutDir\macos\"
Copy-Item "installer\config.json"           "$OutDir\"
Copy-Item "installer\README.txt"            "$OutDir\"
Ok "Installer scripts copied"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Package ready: $OutDir" -ForegroundColor Green
Write-Host ""
Write-Host "  Contents:" -ForegroundColor White
Get-ChildItem -Recurse $OutDir | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object {
        $rel  = $_.FullName.Substring((Resolve-Path $OutDir).Path.Length + 1)
        $size = if ($_.Length -gt 1MB) { "{0:N1} MB" -f ($_.Length / 1MB) }
                else                   { "{0:N0} KB" -f ($_.Length / 1KB) }
        Write-Host ("    {0,-45} {1,8}" -f $rel, $size)
    }

Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Edit $OutDir\config.json with your dashboard URL and secret" -ForegroundColor Gray
Write-Host "  2. Copy the $OutDir folder to a USB stick" -ForegroundColor Gray
Write-Host "  3. On each target PC, run the appropriate installer" -ForegroundColor Gray
Write-Host ""
