#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

git pull --ff-only
corepack pnpm install --frozen-lockfile
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}" corepack pnpm build
corepack pnpm --filter @my-savings/api db:migrate

if pm2 describe my-savings-api >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --only my-savings-api --update-env
else
  pm2 start ecosystem.config.cjs --only my-savings-api
fi

pm2 save
