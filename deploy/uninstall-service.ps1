<#
.SYNOPSIS
    Stops and removes the Gnome Oracle Windows service.
.NOTES
    Leaves the install folder (and the sqlite db) in place unless -Purge is given.
#>
param(
    [string]$ServiceName = "GnomeOracle",
    [string]$InstallPath = "C:\Services\GnomeOracle",
    [switch]$Purge
)

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must be run as Administrator."
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Stopped") {
    Write-Host "Stopping $ServiceName ..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

$winswExe = Join-Path $InstallPath "$ServiceName.exe"
if (Test-Path $winswExe) {
    Write-Host "Uninstalling service via WinSW ..."
    & $winswExe uninstall | Out-Null
}
elseif ($svc) {
    sc.exe delete $ServiceName | Out-Null
}

if ($Purge) {
    Write-Host "Purging $InstallPath (including the sqlite database) ..."
    Remove-Item -Path $InstallPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. $ServiceName removed."
