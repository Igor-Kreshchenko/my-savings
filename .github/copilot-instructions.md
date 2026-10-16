# Copilot Instructions: FX Savings Tracker

Reply to the developer in Russian. Code, identifiers, comments, commit messages and docs are in English.

## Purpose
Personal PWA (single user, no Google Play) that tracks a fixed USD amount, fetches the daily USD/UAH rate from the NBU, and shows the UAH equivalent, day-over-day change, PnL vs a base point, and rate history charts.

## Stack (do not substitute without asking)
- Monorepo: pnpm workspaces. `apps/api`, `apps/web`, `packages/shared`.
- API: Node.js 20+, TypeScript (strict), Fastify, `zod` (validation, shared with web), `node-cron`, Drizzle ORM + `better-sqlite3`, Vitest.
- Web: React 18, Vite, TypeScript (strict), TanStack Query, Recharts, `vite-plugin-pwa`. Mobile-first CSS, no heavy UI kit.
- Deploy: AWS EC2 behind nginx (HTTPS via certbot), pm2. SQLite file lives outside the release directory.

## Repo layout
```
apps/api/src/{server.ts,config.ts,db/,modules/{rates,positions,analytics}/,jobs/,lib/}
apps/web/src/{main.tsx,api/,features/,components/,hooks/}
packages/shared/src/{schemas.ts,types.ts}
```
- One module = routes + service + repository. Routes stay thin; logic lives in services.
- Shared zod schemas and DTO types live only in `packages/shared`.

## Coding conventions
- TypeScript `strict`, no `any`, no non-null `!` without a comment. Prefer `unknown` + zod parsing at boundaries.
- ESM, async/await, no callbacks. Small pure functions for all math (easy to unit test).
- Config via env, validated with zod at startup (`API_TOKEN`, `DB_PATH`, `PORT`, `TZ=Europe/Kyiv`). Never hardcode secrets.
- Errors: throw typed errors, map to HTTP codes in one Fastify error handler. Log with Fastify's pino logger.
- Keep dependencies minimal; ask before adding a new one.

## Domain rules
- Dates are `YYYY-MM-DD` strings in Europe/Kyiv. Never use `Date` arithmetic for day logic without a helper in `lib/dates.ts`.
- USD amounts are stored as integer cents (`*_cents`). Rates are `REAL` (UAH per 1 USD). Round only at presentation (2 decimals for money, 4 for rates).
- Weekends/holidays have no new NBU rate: forward-fill the last known rate in analytics. Do not write synthetic rows.
- All rate writes are idempotent: `INSERT ... ON CONFLICT(date, currency) DO UPDATE`.

## Database schema
```sql
rates (date TEXT, currency TEXT, rate REAL NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (date, currency));
positions (id INTEGER PRIMARY KEY, currency TEXT NOT NULL, base_date TEXT NOT NULL, base_rate REAL NOT NULL, note TEXT);
balance_events (id INTEGER PRIMARY KEY, position_id INTEGER NOT NULL REFERENCES positions(id), date TEXT NOT NULL, delta_cents INTEGER NOT NULL, note TEXT);
```
- The first `balance_events` row is the initial deposit (e.g. 10 000 USD = 1_000_000 cents).
- Amount at date D = `SUM(delta_cents) WHERE date <= D`. No materialized daily snapshots; compute on read.
- Schema changes only via Drizzle migrations.

## NBU API
- Endpoint: `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&date=YYYYMMDD&json`
- Response is an array; use `[0].rate`. Empty array = no rate for that date.
- Client: timeout 10s, 3 retries with backoff, zod-validated response. Isolate in `modules/rates/nbu.client.ts` behind a `RateProvider` interface so another source can be added later (`source` column).
- Cron: `0 16 * * 1-5`, timezone Europe/Kyiv. On failure retry every 10 min, max 3 times.
- On server start run catch-up: fetch every missing date from the last stored date to today.
- Provide a `backfill` CLI script (`from` date -> today).

## Analytics formulas
For date t: A(t) = USD amount, R(t) = rate, V(t) = A(t) * R(t).
- Day-over-day: `V(t) - V(t-1)`; rate change `R(t)/R(t-1) - 1`.
- Period change: `V(t2) - V(t1)`.
- Net PnL vs base: `V(t) - A_base * R_base`; percent: `R(t)/R_base - 1`.
- With deposits/withdrawals, separate FX PnL from cash flow using lots: `FX_PnL = sum(A_lot * (R(t) - R(lot_date)))`, `cash_flow = sum(delta * R(event_date))`. Never present `V(t) - V(base)` as PnL when events exist.
- Also return min/max rate for the period, max drawdown, 7/30-day moving average.
- Put every formula in `modules/analytics/calc.ts` as pure functions with Vitest tests (including weekend gaps and deposit/withdrawal cases).

## REST API
- `GET /health` (no auth)
- `GET /rates?from&to`
- `GET /positions`, `POST /positions`
- `POST /positions/:id/events`
- `GET /analytics?positionId&from&to` -> `{ series: [{date, rate, usd, uah}], daily, period, pnl, stats }`
- All except `/health` require `Authorization: Bearer <API_TOKEN>`. CORS limited to the app origin (or disabled when nginx serves both).

## Frontend rules
- Mobile-first, one-column layout, touch targets >= 44px, supports dark mode.
- Main screen: current UAH equivalent, PnL (green/red, abs + %), chart with 7d/30d/90d/All toggle. Then rate history table and a deposit/withdraw form.
- Data fetching only through TanStack Query hooks in `api/`; persist the query cache for offline viewing.
- Format money with `Intl.NumberFormat('uk-UA')`. Show loading, empty and error states.
- PWA: manifest (`display: standalone`, icons 192/512, theme color), precache static assets, runtime cache for GET API data.

## Testing and quality
- Vitest for calc, services and the NBU client (mock fetch). One integration test per route with an in-memory SQLite.
- ESLint + Prettier, `pnpm -r typecheck` and `pnpm -r test` must pass before suggesting a change is complete.

## Do / Don't
- Do: explain trade-offs briefly, keep diffs small, update tests with code, suggest a migration when touching schema.
- Don't: use floating-point for USD amounts, store secrets in the repo, add auth systems/ORMs/UI kits beyond this list, or write rates for non-business days.
