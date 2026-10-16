import { dateSchema } from '@my-savings/shared';
import { addCalendarDays } from '../../lib/dates.js';

export interface RatePoint {
  date: string;
  rate: number;
}

export interface BalanceEventPoint {
  date: string;
  deltaCents: number;
}

export interface DailyValuation {
  date: string;
  rate: number;
  usd: number;
  uah: number;
}

export interface PnlBreakdown {
  netUah: number | null;
  netPercent: number | null;
  fxUah: number;
  cashFlowUah: number;
}

export interface AnalyticsStats {
  minRate: number | null;
  maxRate: number | null;
  maxDrawdown: number | null;
  movingAverage7: number | null;
  movingAverage30: number | null;
}

export function forwardFillRates(
  rates: readonly RatePoint[],
  from: string,
  to: string,
): RatePoint[] {
  const start = dateSchema.parse(from);
  const end = dateSchema.parse(to);
  if (start > end) {
    return [];
  }

  const sortedRates = rates
    .map((rate) => ({
      date: dateSchema.parse(rate.date),
      rate: assertPositiveRate(rate.rate),
    }))
    .sort((left, right) =>
      left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
    );

  let currentRate: number | undefined;
  let nextRateIndex = 0;
  while (nextRateIndex < sortedRates.length) {
    const nextRate = sortedRates[nextRateIndex];
    if (nextRate === undefined || nextRate.date > start) {
      break;
    }
    currentRate = nextRate.rate;
    nextRateIndex += 1;
  }

  const result: RatePoint[] = [];
  let date = start;
  while (true) {
    while (nextRateIndex < sortedRates.length) {
      const nextRate = sortedRates[nextRateIndex];
      if (nextRate === undefined || nextRate.date !== date) {
        break;
      }
      currentRate = nextRate.rate;
      nextRateIndex += 1;
    }

    if (currentRate !== undefined) {
      result.push({ date, rate: currentRate });
    }
    if (date === end) {
      break;
    }
    date = addCalendarDays(date, 1);
  }

  return result;
}

export function amountAtDate(
  events: readonly BalanceEventPoint[],
  date: string,
): number {
  const end = dateSchema.parse(date);
  return events.reduce((amountCents, event) => {
    const eventDate = dateSchema.parse(event.date);
    if (!Number.isSafeInteger(event.deltaCents) || event.deltaCents === 0) {
      throw new RangeError(
        'Balance event deltaCents must be a non-zero safe integer',
      );
    }
    if (eventDate > end) {
      return amountCents;
    }
    const updatedAmount = amountCents + event.deltaCents;
    if (!Number.isSafeInteger(updatedAmount)) {
      throw new RangeError('Balance amount exceeds the safe integer range');
    }
    return updatedAmount;
  }, 0);
}

export function calculateValue(amountCents: number, rate: number): number {
  if (!Number.isSafeInteger(amountCents)) {
    throw new RangeError('amountCents must be a safe integer');
  }
  return (amountCents / 100) * assertPositiveRate(rate);
}

export function calculateDayOverDay(
  current: Pick<DailyValuation, 'rate' | 'uah'>,
  previous: Pick<DailyValuation, 'rate' | 'uah'> | undefined,
): { uahChange: number | null; rateChange: number | null } {
  if (previous === undefined) {
    return { uahChange: null, rateChange: null };
  }

  assertPositiveRate(current.rate);
  assertPositiveRate(previous.rate);
  return {
    uahChange: current.uah - previous.uah,
    rateChange: current.rate / previous.rate - 1,
  };
}

export function calculatePeriodChange(
  start: Pick<DailyValuation, 'uah'>,
  end: Pick<DailyValuation, 'uah'>,
): number {
  return end.uah - start.uah;
}

export function calculateBasePnl(
  baseAmountCents: number,
  baseRate: number,
  currentRate: number,
): { netUah: number; netPercent: number } {
  if (!Number.isSafeInteger(baseAmountCents)) {
    throw new RangeError('baseAmountCents must be a safe integer');
  }
  const amountUsd = baseAmountCents / 100;
  const validBaseRate = assertPositiveRate(baseRate);
  const validCurrentRate = assertPositiveRate(currentRate);

  return {
    netUah: amountUsd * (validCurrentRate - validBaseRate),
    netPercent: validCurrentRate / validBaseRate - 1,
  };
}

export function calculateEventPnl(
  events: readonly BalanceEventPoint[],
  rates: readonly RatePoint[],
  asOfDate: string,
): { fxUah: number; cashFlowUah: number } {
  const asOf = dateSchema.parse(asOfDate);
  const currentRate = rateAtDate(rates, asOf);

  return events.reduce(
    (pnl, event) => {
      const eventDate = dateSchema.parse(event.date);
      if (!Number.isSafeInteger(event.deltaCents) || event.deltaCents === 0) {
        throw new RangeError(
          'Balance event deltaCents must be a non-zero safe integer',
        );
      }
      if (eventDate > asOf) {
        return pnl;
      }

      const deltaUsd = event.deltaCents / 100;
      const eventRate = rateAtDate(rates, eventDate);
      pnl.fxUah += deltaUsd * (currentRate - eventRate);
      pnl.cashFlowUah += deltaUsd * eventRate;
      return pnl;
    },
    { fxUah: 0, cashFlowUah: 0 },
  );
}

export function calculatePnl(
  events: readonly BalanceEventPoint[],
  rates: readonly RatePoint[],
  asOfDate: string,
  baseAmountCents: number,
  baseRate: number,
): PnlBreakdown {
  if (events.length > 0) {
    const eventPnl = calculateEventPnl(events, rates, asOfDate);
    return {
      netUah: null,
      netPercent: null,
      ...eventPnl,
    };
  }

  const basePnl = calculateBasePnl(
    baseAmountCents,
    baseRate,
    rateAtDate(rates, asOfDate),
  );
  return {
    netUah: basePnl.netUah,
    netPercent: basePnl.netPercent,
    fxUah: basePnl.netUah,
    cashFlowUah: 0,
  };
}

export function calculateStats(
  series: readonly Pick<DailyValuation, 'rate' | 'uah'>[],
): AnalyticsStats {
  if (series.length === 0) {
    return {
      minRate: null,
      maxRate: null,
      maxDrawdown: null,
      movingAverage7: null,
      movingAverage30: null,
    };
  }

  const rates = series.map(({ rate }) => assertPositiveRate(rate));
  let peakValue = 0;
  let maxDrawdown = 0;

  for (const { uah } of series) {
    if (!Number.isFinite(uah) || uah < 0) {
      throw new RangeError('Series UAH values must be finite and non-negative');
    }
    peakValue = Math.max(peakValue, uah);
    if (peakValue > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peakValue - uah) / peakValue);
    }
  }

  return {
    minRate: Math.min(...rates),
    maxRate: Math.max(...rates),
    maxDrawdown,
    movingAverage7: trailingAverage(rates, 7),
    movingAverage30: trailingAverage(rates, 30),
  };
}

function rateAtDate(rates: readonly RatePoint[], date: string): number {
  const targetDate = dateSchema.parse(date);
  let latestDate: string | undefined;
  let latestRate: number | undefined;

  for (const rate of rates) {
    const rateDate = dateSchema.parse(rate.date);
    if (
      rateDate <= targetDate &&
      (latestDate === undefined || rateDate >= latestDate)
    ) {
      latestDate = rateDate;
      latestRate = assertPositiveRate(rate.rate);
    }
  }

  if (latestRate === undefined) {
    throw new RangeError(`No rate available on or before ${targetDate}`);
  }
  return latestRate;
}

function trailingAverage(
  values: readonly number[],
  window: number,
): number | null {
  if (values.length < window) {
    return null;
  }
  const trailingValues = values.slice(-window);
  return trailingValues.reduce((sum, value) => sum + value, 0) / window;
}

function assertPositiveRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('Rate must be a finite positive number');
  }
  return rate;
}
