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
    [int]$OllamaNumCtx = 8192,
    [string]$OllamaUrl = "http://127.0.0.1:11434",
    [string]$WinSWUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host $Message
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This script must be run as Administrator."
    }
}

function Get-NodeMajor {
    try {
        $version = & node -p "process.versions.node.split('.')[0]" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $version) { return 0 }
        return [int]$version
    }
    catch {
        return 0
    }
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-NativeAddonBuildNeeded {
    $packageJson = Join-Path $repoRoot "package.json"
    if (-not (Test-Path $packageJson)) {
        return $false
    }

    $contents = Get-Content $packageJson -Raw
    return $contents -match '"better-sqlite3"\s*:'
}

function Get-PythonExecutable {
    $candidates = @()

    if ($env:PYTHON) { $candidates += $env:PYTHON }
    if (Test-Command "python") { $candidates += (Get-Command python).Source }
    if (Test-Command "py") { $candidates += (Get-Command py).Source }

    $pythonRoots = @(
        $env:LOCALAPPDATA,
        [Environment]::GetFolderPath("ProgramFiles"),
        [Environment]::GetFolderPath("ProgramFilesX86")
    ) | Where-Object { $_ }

    foreach ($root in $pythonRoots) {
        $candidates += @(
            (Join-Path $root "Programs\Python\Python312\python.exe"),
            (Join-Path $root "Programs\Python\Python311\python.exe"),
            (Join-Path $root "Programs\Python\Python310\python.exe"),
            (Join-Path $root "Python312\python.exe"),
            (Join-Path $root "Python311\python.exe"),
            (Join-Path $root "Python310\python.exe")
        )
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate -or -not (Test-Path $candidate)) {
            continue
        }

        try {
            & $candidate -c "import sys; print(sys.version_info[0])" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
            continue
        }
    }

    return $null
}

function Test-PythonAvailable {
    return [bool](Get-PythonExecutable)
}

function Test-VsBuildToolsAvailable {
    if (Test-Command "cl.exe") { return $true }

    $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $vsWhere = Join-Path $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $installPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        return [bool]$installPath
    }

    return $false
}

function Test-NativeBuildPrereqsPresent {
    return (Test-PythonAvailable) -and (Test-VsBuildToolsAvailable)
}

function Invoke-WingetInstall {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [string]$Source = "winget"
    )

    if (-not (Test-Command "winget")) {
        throw "winget is not installed. Install Python and Visual Studio Build Tools manually, then re-run this script."
    }

    Write-Info "Installing $Id via winget ..."
    & winget install --id $Id -e --source $Source --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget install failed for $Id."
    }
}

function Install-PythonIfNeeded {
    $pythonExe = Get-PythonExecutable
    if ($pythonExe) {
        $env:PYTHON = $pythonExe
        $env:npm_config_python = $pythonExe
        Write-Info "Python is already available."
        return
    }

    Invoke-WingetInstall -Id "Python.Python.3.12"

    $pythonExe = Get-PythonExecutable
    if (-not $pythonExe) {
        throw "Python was installed but could not be located. Re-open an elevated PowerShell window and re-run the installer."
    }

    $env:PYTHON = $pythonExe
    $env:npm_config_python = $pythonExe
}

function Install-VisualStudioBuildToolsIfNeeded {
    if (Test-VsBuildToolsAvailable) {
        Write-Info "Visual Studio C++ build tools are already available."
        return
    }

    $bootstrapper = Join-Path $env:TEMP "vs_buildtools.exe"
    $url = "https://aka.ms/vs/17/release/vs_buildtools.exe"
    Write-Info "Downloading Visual Studio Build Tools bootstrapper ..."
    Invoke-WebRequest -Uri $url -OutFile $bootstrapper

    Write-Info "Installing Visual Studio Build Tools C++ workload ..."
    $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
    $installPath = Join-Path $programFilesX86 "Microsoft Visual Studio\2022\BuildTools"
    $args = @(
        "--quiet",
        "--wait",
        "--norestart",
        "--nocache",
        "--add", "Microsoft.VisualStudio.Workload.VCTools",
        "--includeRecommended",
        "--installPath", $installPath
    )
    $proc = Start-Process -FilePath $bootstrapper -ArgumentList $args -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "Visual Studio Build Tools installation failed with exit code $($proc.ExitCode)."
    }
}

function Set-NativeBuildEnvironment {
    $pythonExe = Get-PythonExecutable
    if ($pythonExe) {
        $env:PYTHON = $pythonExe
        $env:npm_config_python = $pythonExe
    }

    $env:npm_config_msvs_version = "2022"
}

function Ensure-NativeBuildPrereqs {
    if (-not (Test-NativeAddonBuildNeeded)) {
        Write-Info "No native addon build detected in package.json."
        return
    }

    if (Test-NativeBuildPrereqsPresent) {
        Write-Info "Native build prerequisites are already present."
        Set-NativeBuildEnvironment
        return
    }

    Write-Info "Native addon build detected; installing missing prerequisites for Node $([string](Get-NodeMajor))..."
    Install-PythonIfNeeded
    Install-VisualStudioBuildToolsIfNeeded
    Set-NativeBuildEnvironment

    if (-not (Test-NativeBuildPrereqsPresent)) {
        throw "Native build prerequisites are still missing after installation."
    }
}

function Invoke-NpmInstallAndBuild {
    Push-Location $repoRoot
    try {
        & $npmCmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        & $npmCmd run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
    }
    finally { Pop-Location }
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
    Write-Info "Preparing build prerequisites and installing dependencies (this can take a minute)..."
    Ensure-NativeBuildPrereqs

    try {
        Invoke-NpmInstallAndBuild
    }
    catch {
        if (-not (Test-NativeAddonBuildNeeded)) {
            throw
        }

        Write-Info "Initial npm install/build failed; retrying after refreshing native prerequisites..."
        Install-PythonIfNeeded
        Install-VisualStudioBuildToolsIfNeeded
        Invoke-NpmInstallAndBuild
    }
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
  <env name="OLLAMA_NUM_CTX" value="$OllamaNumCtx" />
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
