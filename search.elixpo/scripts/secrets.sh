#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENCRYPTED_FILE="$ROOT_DIR/.env"
LOCAL_FILE="$ROOT_DIR/.env.local"
SOPS_CONFIG="$ROOT_DIR/.sops.yaml"

require_tools() {
  command -v sops >/dev/null || { echo "sops is required" >&2; exit 1; }
  test -f "$SOPS_CONFIG" || { echo ".sops.yaml is missing" >&2; exit 1; }
}

decrypt() {
  require_tools
  test -f "$ENCRYPTED_FILE" || { echo "Encrypted .env is missing" >&2; exit 1; }
  local tmp
  tmp="$(mktemp "$ROOT_DIR/.env.local.tmp.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  sops --decrypt "$ENCRYPTED_FILE" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$LOCAL_FILE"
  trap - EXIT
  echo "Decrypted .env -> .env.local (mode 600)"
}

encrypt() {
  require_tools
  test -f "$LOCAL_FILE" || { echo ".env.local is missing; run decrypt first" >&2; exit 1; }
  local tmp
  tmp="$(mktemp "$ROOT_DIR/.env.encrypted.tmp.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  sops --encrypt --input-type dotenv --output-type dotenv --filename-override .env "$LOCAL_FILE" > "$tmp"
  sops --decrypt --input-type dotenv --output-type dotenv "$tmp" >/dev/null
  mv "$tmp" "$ENCRYPTED_FILE"
  trap - EXIT
  echo "Encrypted .env.local -> .env"
}

keys() {
  test -f "$LOCAL_FILE" || { echo ".env.local is missing" >&2; exit 1; }
  awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1}' "$LOCAL_FILE"
}

case "${1:-}" in
  decrypt) decrypt ;;
  encrypt) encrypt ;;
  edit)
    decrypt
    "${EDITOR:-vi}" "$LOCAL_FILE"
    encrypt
    ;;
  keys) keys ;;
  *) echo "Usage: $0 {decrypt|encrypt|edit|keys}" >&2; exit 2 ;;
esac
