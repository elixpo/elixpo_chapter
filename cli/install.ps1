# Install the `falera` CLI (Elixpo Falera Badge) from a GitHub release.
#
#   irm https://raw.githubusercontent.com/elixpo/falera/main/cli/install.ps1 | iex
#
# Downloads the release wheel and its .sha256, checks the SHA-256, and
# installs it with pipx or uv (whichever is present) as an isolated tool.
#
# Environment (or the matching parameter when the script is run as a file):
#   OREO_CLI_VERSION        release to install: latest (default), cli-v0.1.0,
#                           v0.1.0 or 0.1.0
#   OREO_CLI_INSTALLER      pipx or uv (default: pipx if present, else uv)
#   OREO_CLI_REPOSITORY     GitHub repository (default: elixpo/falera)
#   OREO_CLI_DOWNLOAD_BASE  fetch the files from here instead of the
#                           release (for testing); needs a pinned version
param(
    [string]$Version = $(if ($env:OREO_CLI_VERSION) { $env:OREO_CLI_VERSION } else { "latest" }),
    [string]$Installer = $env:OREO_CLI_INSTALLER
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is much faster without it
$Repository = if ($env:OREO_CLI_REPOSITORY) { $env:OREO_CLI_REPOSITORY } else { "elixpo/falera" }
$DownloadBaseOverride = $env:OREO_CLI_DOWNLOAD_BASE
$VersionPattern = '^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$'

# Windows PowerShell 5.1 defaults to TLS 1.0 on older systems.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── installer: pipx or uv ────────────────────────────────────────────
if (-not $Installer) {
    if (Test-Command "pipx") { $Installer = "pipx" }
    elseif (Test-Command "uv") { $Installer = "uv" }
    else {
        throw @"
the falera CLI installs with pipx or uv, and neither was found.

Install one of them, then run this installer again:
  uv:    winget install --id=astral-sh.uv -e
         (or: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex")
  pipx:  py -m pip install --user pipx; py -m pipx ensurepath
"@
    }
}
if ($Installer -ne "pipx" -and $Installer -ne "uv") {
    throw "OREO_CLI_INSTALLER must be pipx or uv (got: $Installer)"
}
if (-not (Test-Command $Installer)) {
    throw "OREO_CLI_INSTALLER=$Installer, but $Installer is not installed"
}

# ── which release ────────────────────────────────────────────────────
function ConvertTo-CliVersion([string]$Value) {
    $v = $Value
    if ($v.StartsWith("cli-")) { $v = $v.Substring(4) }
    if ($v.StartsWith("v")) { $v = $v.Substring(1) }
    if ($v -notmatch $VersionPattern) {
        throw "OREO_CLI_VERSION must look like cli-v0.1.0, v0.1.0 or 0.1.0 (got: $Value)"
    }
    return $v
}

if ($Version -eq "latest") {
    if ($DownloadBaseOverride) { throw "OREO_CLI_DOWNLOAD_BASE needs OREO_CLI_VERSION set to a version" }
    # The repository's "latest" release is FaleraOS itself, so the CLI's
    # newest release is found from its tags (cli-vX.Y.Z), newest first.
    # Pre-releases are only installed when asked for by name.
    try {
        $refs = Invoke-RestMethod -UseBasicParsing `
            -Uri "https://api.github.com/repos/$Repository/git/matching-refs/tags/cli-v"
    } catch {
        throw "could not list the CLI releases on GitHub; set OREO_CLI_VERSION=cli-vX.Y.Z to pick one"
    }
    $Candidates = @($refs |
        ForEach-Object { $_.ref -replace '^refs/tags/cli-v', '' } |
        Where-Object { $_ -match '^[0-9]+\.[0-9]+\.[0-9]+$' } |
        Sort-Object { [Version]$_ } -Descending)
    if ($Candidates.Count -eq 0) { throw "no falera CLI release found in $Repository" }
} else {
    $Candidates = @(ConvertTo-CliVersion $Version)
}

$Temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("falera-cli-install-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $Temporary | Out-Null

try {
    # ── download and verify ──────────────────────────────────────────
    $Chosen = $null
    foreach ($Candidate in $Candidates) {
        if ($DownloadBaseOverride) {
            $Base = $DownloadBaseOverride.TrimEnd("/")
        } else {
            $Base = "https://github.com/$Repository/releases/download/cli-v$Candidate"
        }
        # Releases since the rename ship falera_cli wheels; older ones, oreo_cli.
        $Asset = "falera_cli-$Candidate-py3-none-any.whl"
        $Checksum = Join-Path $Temporary "$Asset.sha256"
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset.sha256" -OutFile $Checksum
            $Chosen = $Candidate
            break
        } catch { }
        $Asset = "oreo_cli-$Candidate-py3-none-any.whl"
        $Checksum = Join-Path $Temporary "$Asset.sha256"
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset.sha256" -OutFile $Checksum
            $Chosen = $Candidate
            break
        } catch {
            # A tag can exist before its release is published; for
            # "latest", fall back to the next older version.
            if ($Version -ne "latest") { throw "falera CLI $Candidate has no release at $Base" }
            Write-Host "note: cli-v$Candidate has no published release yet; trying an older one"
        }
    }
    if (-not $Chosen) { throw "none of the CLI tags in $Repository has a published release" }

    Write-Host "Downloading falera CLI $Chosen"
    $Wheel = Join-Path $Temporary $Asset
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $Wheel

    $Expected = ((Get-Content -Raw $Checksum).Trim() -split "\s+")[0].ToLowerInvariant()
    if ($Expected -notmatch '^[0-9a-f]{64}$') { throw "the release's checksum file is malformed" }
    $Actual = (Get-FileHash -Algorithm SHA256 $Wheel).Hash.ToLowerInvariant()
    if ($Expected -ne $Actual) {
        throw "checksum mismatch for $Asset (expected $Expected, got $Actual); nothing was installed"
    }
    Write-Host "Checksum OK (SHA-256 $Actual)"

    # ── install ──────────────────────────────────────────────────────
    # --force replaces an older falera-cli, so this also upgrades.
    Write-Host "Installing with $Installer"
    if ($Installer -eq "pipx") {
        & pipx install --force $Wheel
    } else {
        & uv tool install --force $Wheel
    }
    if ($LASTEXITCODE -ne 0) { throw "$Installer could not install $Asset" }

    Write-Host ""
    Write-Host "  falera CLI $Chosen is installed." -ForegroundColor Green
    if (-not (Test-Command "falera")) {
        Write-Host ""
        if ($Installer -eq "pipx") {
            Write-Host "  'falera' is not on your PATH yet: run 'pipx ensurepath' and open a new terminal."
        } else {
            Write-Host "  'falera' is not on your PATH yet: run 'uv tool update-shell' and open a new terminal."
        }
    }
    Write-Host ""
    Write-Host "  Plug in the badge and run:  falera" -ForegroundColor Cyan
    Write-Host "  Check the setup:            falera doctor"
    Write-Host "  Docs: https://falera.elixpo.com/docs/cli/"
} finally {
    Remove-Item -Recurse -Force $Temporary -ErrorAction SilentlyContinue
}
