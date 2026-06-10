#Requires -RunAsAdministrator
param(
    [string]$DashboardURL = "",
    [string]$Secret       = "",
    [string]$DeviceName   = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "RMMAgent"
$InstallDir  = "$env:ProgramFiles\RMMAgent"
$ConfigDir   = "$env:ProgramData\RMMAgent"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  RMM Agent Installer" -ForegroundColor Cyan
Write-Host "  ===================" -ForegroundColor Cyan
Write-Host ""

# ── Load config from USB ──────────────────────────────────────────────────────
$usbConfigPath = Join-Path $ScriptDir "..\config.json"
if (Test-Path $usbConfigPath) {
    try {
        $usb = Get-Content $usbConfigPath -Raw | ConvertFrom-Json
        Write-Host "  [+] Loaded config.json from USB" -ForegroundColor DarkGray
    } catch {
        Write-Warning "Could not parse config.json: $_"
        $usb = @{}
    }
} else {
    $usb = [PSCustomObject]@{}
}

# ── Resolve values: USB → param → prompt ─────────────────────────────────────
if (-not $DashboardURL -and $usb.dashboard_url -and $usb.dashboard_url -notlike "*YOUR*") {
    $DashboardURL = $usb.dashboard_url
}
if (-not $Secret -and $usb.registration_secret -and $usb.registration_secret -notlike "*YOUR*") {
    $Secret = $usb.registration_secret
}
if (-not $DeviceName -and $usb.device_name -and $usb.device_name -ne "") {
    $DeviceName = $usb.device_name
}

if (-not $DashboardURL) {
    $DashboardURL = Read-Host "  Dashboard URL  (e.g. http://192.168.1.100:3000)"
}
if (-not $Secret) {
    $Secret = Read-Host "  Registration Secret"
}

$hostname = $env:COMPUTERNAME
if (-not $DeviceName) {
    $entered = Read-Host "  Device Name  [press Enter to use: $hostname]"
    $DeviceName = if ($entered) { $entered } else { $hostname }
}

# Ensure URL has a scheme
if ($DashboardURL -notmatch '^https?://') { $DashboardURL = "http://$DashboardURL" }

Write-Host ""
Write-Host "  Dashboard URL  : $DashboardURL" -ForegroundColor Gray
Write-Host "  Device Name    : $DeviceName" -ForegroundColor Gray
Write-Host ""

# ── Verify binary exists ──────────────────────────────────────────────────────
$agentSrc = Join-Path $ScriptDir "rmm-agent.exe"
if (-not (Test-Path $agentSrc)) {
    Write-Error "rmm-agent.exe not found in $ScriptDir`nMake sure you are running this script from the windows\ folder on the USB stick."
}

# ── Stop and remove existing service ─────────────────────────────────────────
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "  [+] Removed old service" -ForegroundColor DarkGray
}

# ── Install files ─────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force $InstallDir | Out-Null
New-Item -ItemType Directory -Force $ConfigDir  | Out-Null

Copy-Item -Force $agentSrc "$InstallDir\rmm-agent.exe"
Write-Host "  [+] Installed  $InstallDir\rmm-agent.exe" -ForegroundColor DarkGray

# ── Write config ──────────────────────────────────────────────────────────────
$config = [ordered]@{
    dashboard_url       = $DashboardURL
    registration_secret = $Secret
    device_name         = $DeviceName
    interval_seconds    = 30
    agent_version       = "1.0.0"
}
[System.IO.File]::WriteAllText("$ConfigDir\config.json", ($config | ConvertTo-Json))
Write-Host "  [+] Wrote config $ConfigDir\config.json" -ForegroundColor DarkGray

# ── Register Windows service ──────────────────────────────────────────────────
$exePath = "$InstallDir\rmm-agent.exe"
& sc.exe create $ServiceName binpath= "`"$exePath`"" start= auto DisplayName= "RMM Agent" | Out-Null
& sc.exe description $ServiceName "Remote Monitoring and Management Agent" | Out-Null
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
Write-Host "  [+] Service registered" -ForegroundColor DarkGray

# ── Start service ─────────────────────────────────────────────────────────────
Start-Service -Name $ServiceName
$svc = Get-Service -Name $ServiceName
Write-Host "  [+] Service status: $($svc.Status)" -ForegroundColor DarkGray

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  The RMM Agent is running and will auto-start on every boot." -ForegroundColor White
Write-Host "  This device should appear in your dashboard within 30 seconds." -ForegroundColor White
Write-Host ""
Write-Host "  To uninstall, run uninstall.ps1 as Administrator." -ForegroundColor DarkGray
Write-Host ""
