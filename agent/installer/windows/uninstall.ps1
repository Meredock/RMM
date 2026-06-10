#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$ServiceName = "RMMAgent"
$InstallDir  = "$env:ProgramFiles\RMMAgent"
$ConfigDir   = "$env:ProgramData\RMMAgent"

Write-Host ""
Write-Host "  RMM Agent Uninstaller" -ForegroundColor Cyan
Write-Host "  =====================" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "  Remove RMM Agent from this computer? [y/N]"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host "  Cancelled." -ForegroundColor Yellow
    exit 0
}
Write-Host ""

# Stop and delete service
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Stopping service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "  [+] Service removed" -ForegroundColor DarkGray
} else {
    Write-Host "  Service not found (already removed?)" -ForegroundColor DarkGray
}

# Remove install directory
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
    Write-Host "  [+] Removed $InstallDir" -ForegroundColor DarkGray
}

# Optionally remove config
if (Test-Path $ConfigDir) {
    $keepConfig = Read-Host "  Keep config/device registration data? [Y/n]"
    if ($keepConfig -match '^[Nn]$') {
        Remove-Item -Recurse -Force $ConfigDir
        Write-Host "  [+] Removed $ConfigDir" -ForegroundColor DarkGray
    } else {
        Write-Host "  Config kept at $ConfigDir" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "  Uninstall complete." -ForegroundColor Green
Write-Host "  The device will appear offline in your dashboard shortly." -ForegroundColor White
Write-Host ""
