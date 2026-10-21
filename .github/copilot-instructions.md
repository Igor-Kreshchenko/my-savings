# Copilot Instructions: FX Savings Tracker

Reply to the developer in Russian. Code, identifiers, comments, commit messages and docs are in English.

## Purpose
Personal PWA (single user, no Google Play) that tracks a fixed USD amount, fetches the USD/UAH buy and sell rates from Monobank, and shows the UAH equivalent, day-over-day change, PnL vs a base point, and rate history charts. NBU rates are retained as estimated gap fillers.

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
- Monobank has no historical endpoint; fetch the current USD/UAH rate on the three-hour schedule and upsert today's row. Do not write synthetic weekend rows.
- Analytics prefers `mono.rate_buy`; when a date has no Monobank row, use the NBU rate or forward-fill the previous rate, and set `estimated: true`.
- All rate writes are idempotent: `INSERT ... ON CONFLICT(date, currency, source) DO UPDATE`.

## Database schema
```sql
rates (date TEXT, currency TEXT, rate_buy REAL NOT NULL, rate_sell REAL, source TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (date, currency, source));
positions (id INTEGER PRIMARY KEY, currency TEXT NOT NULL, base_date TEXT NOT NULL, base_rate REAL NOT NULL, note TEXT);
balance_events (id INTEGER PRIMARY KEY, position_id INTEGER NOT NULL REFERENCES positions(id), date TEXT NOT NULL, delta_cents INTEGER NOT NULL, note TEXT);
```
- The first `balance_events` row is the initial deposit (e.g. 10 000 USD = 1_000_000 cents).
- Amount at date D = `SUM(delta_cents) WHERE date <= D`. No materialized daily snapshots; compute on read.
- Schema changes only via Drizzle migrations.

## Rate sources
- Monobank endpoint: `https://api.monobank.ua/bank/currency` (no authentication). Select `currencyCodeA=840`, `currencyCodeB=980`, validate the response with zod, and store `rateBuy`/`rateSell` as source `mono`.
- On HTTP 429, do not issue another Monobank request for at least 60 seconds. Requests must time out.
- Never fetch Monobank rates from a request handler; serve rates already in SQLite.
- Fetch Monobank rates every 3 hours in `Europe/Kyiv`. Repeated updates on a date replace that date's Monobank row, preserving the latest (closing) quote.
- Endpoint: `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&date=YYYYMMDD&json`
- Response is an array; use `[0].rate`. Empty array = no rate for that date.
- NBU remains in `modules/rates/nbu.client.ts` behind the same `RateProvider` interface, with timeout, retries, and zod validation; it is only used for startup catch-up, user-created position gap filling, and the `backfill` CLI.
- The NBU `backfill` fills weekday dates missing from source `nbu`; it must not use Monobank rows to decide which NBU dates are missing.

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
- `POST /rates/refresh` (authenticated) returns `{ date, rateBuy, rateSell, fetchedAt, stale }`; use the stored Monobank row if refreshed within 5 minutes, otherwise refresh Monobank with single-flight and a 60-second request limit, falling back to a stale stored row on provider errors.
- `GET /positions`, `POST /positions`
- `POST /positions/:id/events`
- `GET /analytics?positionId&from&to` -> `{ series: [{date, rate, usd, uah, pnlUah, estimated}], daily, period, pnl, stats }`; `rate` is Monobank `rate_buy` when present, `pnlUah` is cumulative FX profit/loss excluding cash flows, and each estimate is marked.
- All except `/health` require `Authorization: Bearer <API_TOKEN>`. CORS limited to the app origin (or disabled when nginx serves both).
- The web app calls the refresh endpoint on startup and when the tab becomes visible, at most once per 60 seconds, then invalidates analytics and rates. It displays the fetched time in Europe/Kyiv and keeps persisted cached data available with an offline/outdated status if refresh fails. The service worker must not intercept or cache the POST refresh request.

## Frontend rules
- Mobile-first, one-column layout, touch targets >= 44px, supports dark mode.
- Main screen: current UAH equivalent, PnL (green/red, abs + %), FX profit/loss chart with a fixed 7d/30d/90d/All date domain. Then a paginated, date-sortable rate history table and a deposit/withdraw form.
- Data fetching only through TanStack Query hooks in `api/`; persist the query cache for offline viewing.
- Format money with `Intl.NumberFormat('uk-UA')`. Show loading, empty and error states.
- PWA: manifest (`display: standalone`, icons 192/512, theme color), precache static assets, runtime cache for GET API data.

## Testing and quality
- Vitest for calc, services, Monobank and NBU clients (mock fetch). One integration test per route with an in-memory SQLite.
- ESLint + Prettier, `pnpm -r typecheck` and `pnpm -r test` must pass before suggesting a change is complete.

## Do / Don't
- Do: explain trade-offs briefly, keep diffs small, update tests with code, suggest a migration when touching schema.
- Don't: use floating-point for USD amounts, store secrets in the repo, add auth systems/ORMs/UI kits beyond this list, or write rates for non-business days.
