# My Savings

Personal FX savings tracker monorepo.

## Requirements

- Node.js 20.6 or newer
- pnpm 9.15.9

## Workspace

- `apps/api` — Fastify API
- `apps/web` — React and Vite web application
- `packages/shared` — shared TypeScript package and Zod schemas

## API setup

Copy `apps/api/.env.example` to `apps/api/.env` and set `API_TOKEN`. The API's
`dev`, `start` and `db:migrate` scripts load that file automatically.
`DB_PATH`, `PORT` and `TZ` are optional; they default to
`./data/my-savings.sqlite`, `3000` and `Europe/Kyiv`.

The API applies pending SQLite migrations automatically when it opens the
database. To apply them manually from the repository root:

```sh
pnpm --filter @my-savings/api db:migrate
```

The API health endpoint is available at `GET /health`.

All API routes except `GET /health` require a valid Authorization header
authenticated with the configured `API_TOKEN`. The authenticated endpoints are:

- `GET /positions` and `POST /positions` to list or create USD positions.
  Creating a position backfills available NBU rates from `baseDate` through
  today; record its initial balance with an event.
- `POST /positions/:id/events` to record a non-zero deposit or withdrawal in
  integer USD cents. Withdrawals that would make the balance negative are
  rejected.
- `GET /rates?from=YYYY-MM-DD&to=YYYY-MM-DD` to list stored rates; either date
  bound can be omitted.
- `GET /analytics?positionId=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD` to retrieve
  daily valuations, period changes, PnL and rate statistics.

Rates are fetched from the NBU at 16:00 on weekdays in `Europe/Kyiv`. The API
checks for missing weekdays on startup; holidays without an NBU rate are not
written. To backfill from a date, run this from the repository root:

```sh
pnpm --filter @my-savings/api rates:backfill --from 2026-01-01
```

## Commands

Run these from the repository root:

```sh
corepack enable
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

The API endpoints, rates provider and synchronization job are implemented;
the web application is still under development.
