#!/usr/bin/env bash
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_url="http://127.0.0.1:5173"
health_url="${app_url}/api/health"

cd "$app_dir"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent default >/dev/null
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20.6 or newer is required. Install it, then launch My Savings again." >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 6) ? 0 : 1)'; then
  echo "Node.js 20.6 or newer is required; found $(node --version)." >&2
  echo "Install or activate a supported Node.js version, then launch My Savings again." >&2
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm_command=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  pnpm_command=(corepack pnpm)
else
  echo "pnpm or Corepack is required. Install pnpm, then launch My Savings again." >&2
  exit 1
fi

if [[ ! -f apps/api/.env ]]; then
  echo "Missing apps/api/.env. Copy apps/api/.env.example there and set API_TOKEN." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v xdg-open >/dev/null 2>&1; then
  echo "This launcher requires curl and xdg-open." >&2
  exit 1
fi

"${pnpm_command[@]}" dev &
dev_pid=$!
opener_pid=""

cleanup() {
  if [[ -n "$opener_pid" ]]; then
    kill "$opener_pid" 2>/dev/null || true
  fi
  kill "$dev_pid" 2>/dev/null || true
  wait "$dev_pid" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  for _ in {1..60}; do
    if curl --silent --fail "$health_url" >/dev/null; then
      xdg-open "$app_url"
      exit 0
    fi
    sleep 1
  done

  echo "My Savings did not become ready. Check the API and web server output." >&2
) &
opener_pid=$!

wait "$dev_pid"
