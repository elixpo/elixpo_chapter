#!/bin/sh
# Install the `falera` CLI (Elixpo Falera Badge) from a GitHub release.
#
#   curl --proto '=https' --tlsv1.2 -LsSf \
#     https://raw.githubusercontent.com/elixpo/falera/main/cli/install.sh | sh
#
# Downloads the release wheel and its .sha256, checks the SHA-256, and
# installs it with pipx or uv (whichever is present) as an isolated tool.
#
# Environment:
#   OREO_CLI_VERSION        release to install: latest (default), cli-v0.1.0,
#                           v0.1.0 or 0.1.0
#   OREO_CLI_INSTALLER      pipx or uv (default: pipx if present, else uv)
#   OREO_CLI_REPOSITORY     GitHub repository (default: elixpo/falera)
#   OREO_CLI_DOWNLOAD_BASE  fetch the files from here instead of the
#                           release (for testing); needs a pinned version

set -eu

repository=${OREO_CLI_REPOSITORY:-elixpo/falera}
requested=${OREO_CLI_VERSION:-latest}
installer=${OREO_CLI_INSTALLER:-}

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required to install the falera CLI"

# ── installer: pipx or uv ────────────────────────────────────────────
if [ -z "$installer" ]; then
  if command -v pipx >/dev/null 2>&1; then
    installer=pipx
  elif command -v uv >/dev/null 2>&1; then
    installer=uv
  else
    cat >&2 <<'EOF'
error: the falera CLI installs with pipx or uv, and neither was found.

Install one of them, then run this installer again:
  uv:    curl -LsSf https://astral.sh/uv/install.sh | sh
  pipx:  python3 -m pip install --user pipx && python3 -m pipx ensurepath
         (Debian/Ubuntu: sudo apt install pipx; macOS: brew install pipx)
EOF
    exit 1
  fi
fi
case "$installer" in
  pipx | uv) command -v "$installer" >/dev/null 2>&1 || fail "OREO_CLI_INSTALLER=$installer, but $installer is not installed" ;;
  *) fail "OREO_CLI_INSTALLER must be pipx or uv (got: $installer)" ;;
esac

# ── which release ────────────────────────────────────────────────────
# A version is digits and dots, optionally with a PEP 440 pre-release
# suffix (0.2.0rc1). Anything else is rejected before it reaches a URL.
normalise() {
  v=${1#cli-}
  v=${v#v}
  if printf '%s\n' "$v" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$'; then
    printf '%s\n' "$v"
  else
    return 1
  fi
}

https_flags="--proto =https --tlsv1.2 --fail --location --silent --show-error"
if [ -n "${OREO_CLI_DOWNLOAD_BASE:-}" ]; then
  curl_flags="--fail --location --silent --show-error"
else
  curl_flags=$https_flags
fi

temporary=$(mktemp -d "${TMPDIR:-/tmp}/falera-cli-install.XXXXXX")
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

if [ "$requested" = latest ]; then
  [ -z "${OREO_CLI_DOWNLOAD_BASE:-}" ] || fail "OREO_CLI_DOWNLOAD_BASE needs OREO_CLI_VERSION set to a version"
  # The repository's "latest" release is FaleraOS itself, so the CLI's
  # newest release is found from its tags (cli-vX.Y.Z), newest first.
  # Pre-releases are only installed when asked for by name.
  # shellcheck disable=SC2086
  curl $https_flags --output "$temporary/tags.json" \
    "https://api.github.com/repos/${repository}/git/matching-refs/tags/cli-v" ||
    fail "could not list the CLI releases on GitHub; set OREO_CLI_VERSION=cli-vX.Y.Z to pick one"
  candidates=$(tr ',{}' '\n\n\n' <"$temporary/tags.json" |
    sed -n 's|^ *"ref": *"refs/tags/cli-v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)" *$|\1|p' |
    sort -t . -k 1,1nr -k 2,2nr -k 3,3nr)
  [ -n "$candidates" ] || fail "no falera CLI release found in ${repository}"
else
  candidates=$(normalise "$requested") ||
    fail "OREO_CLI_VERSION must look like cli-v0.1.0, v0.1.0 or 0.1.0 (got: $requested)"
fi

# ── download and verify ──────────────────────────────────────────────
version=
for candidate in $candidates; do
  if [ -n "${OREO_CLI_DOWNLOAD_BASE:-}" ]; then
    base=${OREO_CLI_DOWNLOAD_BASE%/}
  else
    base="https://github.com/${repository}/releases/download/cli-v${candidate}"
  fi
  # Releases since the rename ship falera_cli wheels; older ones, oreo_cli.
  asset="falera_cli-${candidate}-py3-none-any.whl"
  # shellcheck disable=SC2086
  if curl $curl_flags --output "$temporary/$asset.sha256" "$base/$asset.sha256" 2>/dev/null; then
    version=$candidate
    break
  fi
  asset="oreo_cli-${candidate}-py3-none-any.whl"
  # shellcheck disable=SC2086
  if curl $curl_flags --output "$temporary/$asset.sha256" "$base/$asset.sha256" 2>/dev/null; then
    version=$candidate
    break
  fi
  # A tag can exist before its release is published (or after a failed
  # release run); for "latest", fall back to the next older version.
  [ "$requested" = latest ] || fail "falera CLI ${candidate} has no release at $base"
  echo "note: cli-v${candidate} has no published release yet; trying an older one" >&2
done
[ -n "$version" ] || fail "none of the CLI tags in ${repository} has a published release"

echo "Downloading falera CLI ${version}"
# shellcheck disable=SC2086
curl $curl_flags --output "$temporary/$asset" "$base/$asset" ||
  fail "could not download $base/$asset"

expected=$(awk 'NR == 1 { print tolower($1) }' "$temporary/$asset.sha256")
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temporary/$asset" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$temporary/$asset" | awk '{ print $1 }')
else
  fail "sha256sum or shasum is required to verify the download"
fi
printf '%s\n' "$expected" | grep -Eq '^[0-9a-f]{64}$' || fail "the release's checksum file is malformed"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset (expected $expected, got $actual); nothing was installed"
echo "Checksum OK (SHA-256 $actual)"

# ── install ──────────────────────────────────────────────────────────
# --force replaces an older falera-cli, so this also upgrades.
echo "Installing with $installer"
case "$installer" in
  pipx) pipx install --force "$temporary/$asset" ;;
  uv) uv tool install --force "$temporary/$asset" ;;
esac

echo
echo "  falera CLI ${version} is installed."
if ! command -v falera >/dev/null 2>&1; then
  echo
  case "$installer" in
    pipx) echo "  'falera' is not on your PATH yet: run 'pipx ensurepath' and open a new terminal." ;;
    uv) echo "  'falera' is not on your PATH yet: run 'uv tool update-shell' and open a new terminal." ;;
  esac
fi
if [ "$(uname -s)" = Linux ]; then
  echo
  echo "  Linux: the serial port needs the dialout group (uucp on Arch):"
  echo "    sudo usermod -aG dialout \$USER   # then log out and back in"
fi
echo
echo "  Plug in the badge and run:  falera"
echo "  Check the setup:            falera doctor"
echo "  Docs: https://falera.elixpo.com/docs/cli/"
