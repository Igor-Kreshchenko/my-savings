import { useState } from 'react';
import type { AnalyticsResponse, Position } from '@my-savings/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiToken } from '../../api/settings.js';
import { ApiError } from '../../api/client.js';
import { useAnalytics, usePositions } from '../../api/queries.js';
import { addCalendarDays, getTodayInKyiv } from '../../lib/dates.js';

const periods = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

type Period = (typeof periods)[number]['label'] | 'all';

const uahFormatter = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdFormatter = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const rateFormatter = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const percentFormatter = new Intl.NumberFormat('uk-UA', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});
const compactDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(date: string, formatter: Intl.DateTimeFormat): string {
  return formatter.format(new Date(`${date}T00:00:00.000Z`));
}

function getRangeStart(
  period: Period,
  position: Position,
  today: string,
): string {
  if (period === 'all') {
    return position.baseDate;
  }

  const days = periods.find(({ label }) => label === period)?.days;
  if (days === undefined) {
    throw new Error(`Unsupported dashboard period: ${period}`);
  }

  const requestedStart = addCalendarDays(today, -(days - 1));
  return requestedStart < position.baseDate
    ? position.baseDate
    : requestedStart;
}

function getDashboardErrorMessage(error: Error): string {
  return error.message || 'Something went wrong while loading your savings.';
}

function LoadingDashboard() {
  return (
    <section className="dashboard-state" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <p>Loading your savings…</p>
    </section>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="dashboard-state error-state" role="alert">
      <p className="eyebrow">Unable to load data</p>
      <h2>{title}</h2>
      <p>{message}</p>
      <button className="secondary-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="dashboard-state empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        $
      </div>
      <p className="eyebrow">Ready when you are</p>
      <h1>No savings position yet</h1>
      <p>
        Create a position and add its initial balance to start tracking your USD
        savings in UAH.
      </p>
      <button
        className="secondary-button"
        type="button"
        onClick={onOpenSettings}
      >
        Check API settings
      </button>
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: AnalyticsResponse['series'][number] }>;
  label?: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{label ? formatDate(label, fullDateFormatter) : ''}</strong>
      <span>{uahFormatter.format(point.uah)}</span>
      <span>{usdFormatter.format(point.usd)}</span>
      <span>Rate {rateFormatter.format(point.rate)} UAH / USD</span>
    </div>
  );
}

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const hasApiToken = Boolean(getApiToken());
  const positionsQuery = usePositions({ enabled: hasApiToken });
  const [period, setPeriod] = useState<Period>('30d');
  const [selectedPositionId, setSelectedPositionId] = useState<number>();

  const positions = positionsQuery.data ?? [];
  const selectedPosition =
    positions.find(({ id }) => id === selectedPositionId) ?? positions[0];
  const today = getTodayInKyiv();
  const rangeStart =
    selectedPosition === undefined
      ? undefined
      : getRangeStart(period, selectedPosition, today);
  const analyticsQuery = useAnalytics(
    {
      positionId: selectedPosition?.id ?? 1,
      from: rangeStart ?? today,
      to: today,
    },
    { enabled: hasApiToken && selectedPosition !== undefined },
  );

  if (!hasApiToken) {
    return (
      <section className="dashboard-state empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          $
        </div>
        <p className="eyebrow">Connect your tracker</p>
        <h1>Your savings, at a glance.</h1>
        <p>
          Add your API token to load your current UAH balance and exchange-rate
          history.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={onOpenSettings}
        >
          Configure API access
        </button>
      </section>
    );
  }

  if (positionsQuery.isPending) {
    return <LoadingDashboard />;
  }

  if (positionsQuery.isError) {
    return (
      <ErrorState
        title="Your positions could not be loaded"
        message={getDashboardErrorMessage(positionsQuery.error)}
        onRetry={() => void positionsQuery.refetch()}
      />
    );
  }

  if (selectedPosition === undefined) {
    return <EmptyState onOpenSettings={onOpenSettings} />;
  }

  if (analyticsQuery.isPending) {
    return <LoadingDashboard />;
  }

  if (analyticsQuery.isError) {
    if (
      analyticsQuery.error instanceof ApiError &&
      analyticsQuery.error.code === 'RATE_DATA_NOT_FOUND'
    ) {
      return (
        <section className="dashboard-state empty-state">
          <p className="eyebrow">No rate history</p>
          <h1>Waiting for exchange rates</h1>
          <p>
            The API has no saved rate for this position yet. Rates are
            synchronized automatically on weekdays.
          </p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void analyticsQuery.refetch()}
          >
            Refresh data
          </button>
        </section>
      );
    }

    return (
      <ErrorState
        title="Your savings history could not be loaded"
        message={getDashboardErrorMessage(analyticsQuery.error)}
        onRetry={() => void analyticsQuery.refetch()}
      />
    );
  }

  const analytics = analyticsQuery.data;
  const latest = analytics.series.at(-1);
  if (latest === undefined) {
    return (
      <section className="dashboard-state empty-state">
        <p className="eyebrow">No rate history</p>
        <h1>No data for this period</h1>
        <p>
          There are no saved exchange rates for the selected position yet. Try
          again after the API has synchronized rates.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void analyticsQuery.refetch()}
        >
          Refresh data
        </button>
      </section>
    );
  }

  const pnlAmount = analytics.pnl.netUah ?? analytics.pnl.fxUah;
  const pnlIsPositive = pnlAmount >= 0;
  const pnlPercent = analytics.pnl.netPercent;

  return (
    <div className="dashboard">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">Your savings</p>
          <h1>Dashboard</h1>
          <p className="dashboard-date">
            Updated for {formatDate(latest.date, fullDateFormatter)}
          </p>
        </div>
        {positions.length > 1 && (
          <label className="position-select-label">
            <span>Position</span>
            <select
              value={selectedPosition.id}
              onChange={(event) =>
                setSelectedPositionId(Number(event.target.value))
              }
            >
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.note ||
                    `${position.currency} position #${position.id}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="metric-grid" aria-label="Savings overview">
        <article className="metric-card balance-card">
          <p className="metric-label">Current value</p>
          <p className="balance-value">{uahFormatter.format(latest.uah)}</p>
          <p className="metric-detail">
            {usdFormatter.format(latest.usd)} at{' '}
            {rateFormatter.format(latest.rate)} UAH / USD
          </p>
        </article>
        <article className="metric-card pnl-card">
          <p className="metric-label">
            {analytics.pnl.netUah === null
              ? 'FX profit / loss'
              : 'Profit / loss'}
          </p>
          <p className={`pnl-value ${pnlIsPositive ? 'positive' : 'negative'}`}>
            {pnlIsPositive ? '+' : ''}
            {uahFormatter.format(pnlAmount)}
          </p>
          {pnlPercent === null ? (
            <p className="metric-detail">
              Percentage unavailable with cash flows
            </p>
          ) : (
            <p
              className={`metric-detail ${pnlIsPositive ? 'positive' : 'negative'}`}
            >
              {percentFormatter.format(pnlPercent)} vs. base rate
            </p>
          )}
        </article>
      </section>

      <section className="panel chart-panel" aria-labelledby="chart-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Performance</p>
            <h2 id="chart-heading">Savings value</h2>
          </div>
          <div
            className="period-switch"
            role="group"
            aria-label="Chart date range"
          >
            {([...periods.map(({ label }) => label), 'all'] as Period[]).map(
              (option) => (
                <button
                  key={option}
                  className={period === option ? 'selected' : ''}
                  type="button"
                  aria-pressed={period === option}
                  onClick={() => setPeriod(option)}
                >
                  {option === 'all' ? 'All' : option}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={analytics.series}
              margin={{ top: 10, right: 12, bottom: 0, left: 4 }}
            >
              <CartesianGrid
                stroke="var(--chart-grid)"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) =>
                  formatDate(value, compactDateFormatter)
                }
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                tick={{ fill: 'var(--chart-label)', fontSize: 12 }}
              />
              <YAxis
                width={74}
                tickFormatter={(value: number) =>
                  new Intl.NumberFormat('uk-UA', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(value)
                }
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--chart-label)', fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="uah"
                name="Savings value"
                stroke="var(--accent)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-caption">
          Daily UAH value · exchange rates are carried forward on weekends and
          holidays
        </p>
      </section>

      <section className="panel stats-panel" aria-labelledby="stats-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Selected period</p>
            <h2 id="stats-heading">Summary stats</h2>
          </div>
          <span className="stats-period">
            {formatDate(
              analytics.series[0]?.date ?? today,
              compactDateFormatter,
            )}
            {' – '}
            {formatDate(latest.date, compactDateFormatter)}
          </span>
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <span>Lowest rate</span>
            <strong>
              {analytics.stats.minRate === null
                ? '—'
                : `${rateFormatter.format(analytics.stats.minRate)} ₴`}
            </strong>
          </div>
          <div className="stat-item">
            <span>Highest rate</span>
            <strong>
              {analytics.stats.maxRate === null
                ? '—'
                : `${rateFormatter.format(analytics.stats.maxRate)} ₴`}
            </strong>
          </div>
          <div className="stat-item">
            <span>Max drawdown</span>
            <strong>
              {analytics.stats.maxDrawdown === null
                ? '—'
                : percentFormatter.format(-analytics.stats.maxDrawdown)}
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
}
