<#
.SYNOPSIS
    Builds Gnome Oracle and installs it as an auto-start Windows service via WinSW.

.DESCRIPTION
    Mirrors the service convention already used on this server (auto-start +
    crash-restart). Runs the Next.js standalone build, assembles a self-contained
    payload under -InstallPath, downloads WinSW (if not present), writes its
    config, and registers + starts the service.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-service.ps1
#>
param(
    [string]$ServiceName = "GnomeOracle",
    [string]$InstallPath = "C:\Services\GnomeOracle",
    [int]$Port = 8080,
    [string]$OllamaModel = "gemma2:2b",
    [string]$OllamaUrl = "http://127.0.0.1:11434",
    [string]$WinSWUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This script must be run as Administrator."
    }
}

Assert-Administrator

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$npmCmd = (Get-Command npm -ErrorAction Stop).Source

# --- Port availability check -------------------------------------------------
$inUse = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($inUse) {
    # Allow re-install: only fail if it's something OTHER than our own service.
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        throw "Port $Port is already in use by PID $($inUse[0].OwningProcess). Choose a free port with -Port."
    }
    Write-Host "Port $Port currently used by the existing $ServiceName service (will reinstall)."
}

# --- Build -------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "Installing dependencies and building (this can take a minute)..."
    Push-Location $repoRoot
    try {
        & $npmCmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        & $npmCmd run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
    }
    finally { Pop-Location }
}

$standalone = Join-Path $repoRoot ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
    throw "Standalone build not found at $standalone. Run without -SkipBuild."
}

# --- Stop existing service before overwriting files --------------------------
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$winswExe = Join-Path $InstallPath "$ServiceName.exe"
if ($existing) {
    Write-Host "Stopping existing service $ServiceName..."
    if ($existing.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    if (Test-Path $winswExe) {
        & $winswExe uninstall | Out-Null
        Start-Sleep -Seconds 2
    }
}

# --- Assemble payload --------------------------------------------------------
Write-Host "Assembling payload at $InstallPath ..."
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# 1) standalone server + minimal node_modules (includes better-sqlite3 .node)
Copy-Item -Path (Join-Path $standalone "*") -Destination $InstallPath -Recurse -Force

# 2) static assets + public are NOT included in standalone — copy them in.
$staticSrc = Join-Path $repoRoot ".next\static"
$staticDst = Join-Path $InstallPath ".next\static"
New-Item -ItemType Directory -Path $staticDst -Force | Out-Null
Copy-Item -Path (Join-Path $staticSrc "*") -Destination $staticDst -Recurse -Force

$publicSrc = Join-Path $repoRoot "public"
if (Test-Path $publicSrc) {
    Copy-Item -Path $publicSrc -Destination $InstallPath -Recurse -Force
}

# 3) ensure a writable data dir for the sqlite database (preserve existing db)
New-Item -ItemType Directory -Path (Join-Path $InstallPath "data") -Force | Out-Null

# --- WinSW exe + config ------------------------------------------------------
if (-not (Test-Path $winswExe)) {
    Write-Host "Downloading WinSW from $WinSWUrl ..."
    try {
        Invoke-WebRequest -Uri $WinSWUrl -OutFile $winswExe -UseBasicParsing
    }
    catch {
        throw "Could not download WinSW. Download WinSW-x64.exe manually, place it at '$winswExe', and re-run with -SkipBuild."
    }
}

$configXml = @"
<service>
  <id>$ServiceName</id>
  <name>Gnome Oracle</name>
  <description>Silly Ollama-powered persona web app (Next.js).</description>
  <executable>$nodeExe</executable>
  <arguments>server.js</arguments>
  <workingdirectory>$InstallPath</workingdirectory>
  <env name="PORT" value="$Port" />
  <env name="HOSTNAME" value="0.0.0.0" />
  <env name="NODE_ENV" value="production" />
  <env name="OLLAMA_MODEL" value="$OllamaModel" />
  <env name="OLLAMA_URL" value="$OllamaUrl" />
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="20 sec" />
  <resetfailure>1 hour</resetfailure>
  <startmode>Automatic</startmode>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>3</keepFiles>
  </log>
</service>
"@
$configPath = Join-Path $InstallPath "$ServiceName.xml"
Set-Content -Path $configPath -Value $configXml -Encoding UTF8

# --- Install + start ---------------------------------------------------------
Write-Host "Installing service $ServiceName ..."
& $winswExe install
if ($LASTEXITCODE -ne 0) { throw "WinSW install failed." }
& $winswExe start
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "============================================="
Write-Host " Gnome Oracle installed."
Write-Host "  Service:    $ServiceName ($($svc.Status))"
Write-Host "  Startup:    Automatic (boots with the server)"
Write-Host "  Install at: $InstallPath"
Write-Host "  URL:        http://$(hostname):$Port  (and http://localhost:$Port)"
Write-Host "  Model:      $OllamaModel  via  $OllamaUrl"
Write-Host "============================================="
Write-Host "Reminder: ensure the model is pulled ->  ollama pull $OllamaModel"
