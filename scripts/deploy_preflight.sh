#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
check_file() { [[ -s "$1" ]] || fail "Missing or empty $1"; }

command -v docker >/dev/null || fail "Docker is not installed"
docker compose version >/dev/null || fail "Docker Compose v2 is not available"
check_file .env.local
check_file search.elixpo/out/index.html
check_file deploy/tls/origin.pem
check_file deploy/tls/origin-key.pem

for key in API_KEY POLLINATIONS_API_KEY REDIS_PASSWORD QDRANT_API_KEY IPC_AUTHKEY; do
  value="$(sed -n "s/^${key}=//p" .env.local | tail -n 1)"
  [[ -n "$value" ]] || fail "$key is missing or blank in .env.local"
  case "$value" in
    changeme*|replace_me*|your_*|CHANGE_ME*) fail "$key still has a placeholder value" ;;
  esac
done

docker compose --env-file .env.local config --quiet
printf 'Deployment preflight passed.\n'
