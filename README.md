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

The API endpoints, rates provider and synchronization job are implemented.
The web app provides a responsive savings dashboard with 7/30/90-day and
all-time value charts, current UAH valuation, PnL and rate-period statistics.
When balance events exist, PnL shows the FX component separately from cash
flows; a percentage return is omitted when the API cannot calculate it
without misrepresenting those cash flows. The app also includes theme
switching, API-token settings, a rate history table, and a deposit/withdrawal
form. Balance event amounts are entered in USD and submitted as integer cents;
successful events invalidate analytics queries so dashboard values refresh.
The schema-validated client uses TanStack Query hooks.

## Web app setup

Copy `apps/web/.env.example` to `apps/web/.env.local` to configure the API URL.
The Vite development server proxies `/api` to `http://127.0.0.1:3000` by
default. Override `VITE_API_BASE_URL` when the API is hosted elsewhere. You can
set `VITE_API_TOKEN` as a local default or enter a token in the app's Settings;
the browser-stored token takes precedence.

Values with the `VITE_` prefix are embedded in the browser bundle. Do not use
`VITE_API_TOKEN` for a public deployment or treat it as a secret; the API token
configured in the browser can also be read by scripts running on that origin.

The production web build is installable as a standalone PWA. It precaches
static application assets, caches successful GET API responses for up to seven
days, and persists the TanStack Query cache in localStorage for offline
viewing. When a new service worker is waiting, the app offers an Update action.

## Production deployment (EC2)

The deployment files assume the repository is installed at
`/var/www/my-savings`, with Node.js 20.6+, Corepack/pnpm, Git, PM2, nginx,
Certbot, SQLite CLI, and AWS CLI available on the EC2 instance. Use an EC2
instance profile with permission to upload to the backup bucket; do not put AWS
credentials in the repository or crontab.

### Environment variables

Set the API variables in `apps/api/.env` on the instance:

| Variable    | Required | Production guidance                                                                                                                            |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_TOKEN` | Yes      | Set a long, randomly generated bearer token. Keep it private.                                                                                  |
| `DB_PATH`   | No       | Use an absolute path outside the release, e.g. `/var/lib/my-savings/my-savings.sqlite`. The parent directory must be writable by the API user. |
| `PORT`      | No       | Defaults to `3000`; nginx proxies to `127.0.0.1:3000`.                                                                                         |
| `TZ`        | No       | Defaults to `Europe/Kyiv`, used by the weekday rate job.                                                                                       |

The API example file includes local-development defaults. Replace
`API_TOKEN` and set the production `DB_PATH` before starting the service.

For the web build, `VITE_API_BASE_URL` defaults to `/api` and should remain
same-origin behind this nginx configuration. `VITE_API_TOKEN` is optional, but
must remain unset in production because Vite embeds it in public JavaScript;
enter the API token in the app's Settings instead.

The backup cron environment must set `DB_PATH` to the same absolute database
file as the API and `S3_BACKUP_URI` to the target prefix, for example
`s3://my-savings-backups/production`.

### Install and deploy

Run these commands as the account that owns the checkout and runs PM2:

```sh
sudo mkdir -p /var/www/my-savings /var/lib/my-savings
sudo chown -R "$USER":"$USER" /var/www/my-savings /var/lib/my-savings
# Clone the repository into /var/www/my-savings, then configure apps/api/.env.
cd /var/www/my-savings
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env: set API_TOKEN and DB_PATH=/var/lib/my-savings/my-savings.sqlite.
bash deploy/deploy.sh
```

`deploy.sh` fast-forwards the checked-out branch, installs the locked
dependencies, builds the workspace, applies database migrations, and starts or
reloads the PM2 API process. Keep the SQLite file and `.env` outside any
release-directory replacement; this script updates the existing checkout in
place. It builds with `VITE_API_BASE_URL=/api` unless that variable is
explicitly set for the deploy command.

Configure PM2 to restore its saved process list after an EC2 reboot by running
`pm2 startup` once and executing the systemd command that PM2 prints.

Install `deploy/nginx/my-savings.conf` as an nginx site, replace
`savings.example.com` with the domain, and change the `root` if the checkout is
not at `/var/www/my-savings`. Enable the site and validate/reload nginx:

```sh
sudo ln -s /var/www/my-savings/deploy/nginx/my-savings.conf /etc/nginx/sites-enabled/my-savings
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --redirect -d savings.example.com
```

Point the domain to the EC2 instance and allow inbound ports 80 and 443 in its
security group before requesting the certificate. Do not expose the API port
3000 publicly; nginx proxies to it over localhost. Certbot configures HTTPS
and the HTTP-to-HTTPS redirect in the nginx site.

### Nightly SQLite backup to S3

`deploy/backup.sh` uses SQLite's online `.backup` command, uploads the
timestamped snapshot with `aws s3 cp`, and removes the temporary local copy
after upload. Install the SQLite and AWS CLIs and grant the PM2/cron operating
system account access to the database and the S3 prefix through the EC2
instance profile.

Add a cron entry for the same operating-system account that runs the API. Set
the database path and bucket prefix in the crontab (the script intentionally
does not read secrets from files):

```cron
17 2 * * * DB_PATH=/var/lib/my-savings/my-savings.sqlite S3_BACKUP_URI=s3://my-savings-backups/production /var/www/my-savings/deploy/backup.sh >> /var/lib/my-savings/backup.log 2>&1
```

This runs daily at 02:17 in the cron host's local timezone. Backups are
unencrypted by the script; configure S3 encryption, access restrictions, and
lifecycle retention on the bucket. Test restoring a snapshot periodically.
