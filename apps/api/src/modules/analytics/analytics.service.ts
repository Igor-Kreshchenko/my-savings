import type { AnalyticsQuery, AnalyticsResponse } from '@my-savings/shared';
import {
  amountAtDate,
  calculateDayOverDay,
  calculatePeriodChange,
  calculatePnl,
  calculateStats,
  calculateValue,
  forwardFillRates,
} from './calc.js';
import type { PositionsRepository } from '../positions/positions.repository.js';
import type { RatesRepository } from '../rates/rates.repository.js';
import { AppError } from '../../lib/app-error.js';

export class AnalyticsService {
  constructor(
    private readonly positions: PositionsRepository,
    private readonly rates: RatesRepository,
  ) {}

  get(query: AnalyticsQuery): AnalyticsResponse {
    const position = this.positions.findById(query.positionId);
    if (position === undefined) {
      throw new AppError('Position not found', 404, 'POSITION_NOT_FOUND');
    }

    const rateRows = this.rates.listThrough(query.to, position.currency);
    const ratesByDate = new Map<
      string,
      { date: string; rate: number; estimated: boolean }
    >();
    for (const row of rateRows) {
      const current = ratesByDate.get(row.date);
      if (current === undefined || row.source === 'mono') {
        ratesByDate.set(row.date, {
          date: row.date,
          rate: row.rateBuy,
          estimated: row.source !== 'mono',
        });
      }
    }
    const ratePoints = [...ratesByDate.values()].map(
      ({ date, rate, estimated }) => ({ date, rate, estimated }),
    );
    const filledRates = forwardFillRates(ratePoints, query.from, query.to);
    if (filledRates.length === 0) {
      throw new AppError(
        'No rate data is available for the requested period',
        404,
        'RATE_DATA_NOT_FOUND',
      );
    }

    const events = this.positions
      .listEvents(position.id)
      .map(({ date, deltaCents }) => ({ date, deltaCents }));
    const series = filledRates.map(({ date, rate, estimated }) => {
      const usdCents = amountAtDate(events, date);
      const usd = usdCents / 100;
      return {
        date,
        rate,
        usd,
        uah: calculateValue(usdCents, rate),
        estimated,
      };
    });
    const first = series[0];
    const last = series.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error('Analytics series unexpectedly has no values');
    }

    const previous = series.at(-2);
    const pnl = calculatePnl(
      events,
      ratePoints,
      query.to,
      amountAtDate(events, position.baseDate),
      position.baseRate,
    );
    return {
      series,
      daily: calculateDayOverDay(last, previous),
      period: { uahChange: calculatePeriodChange(first, last) },
      pnl,
      stats: calculateStats(series),
    };
  }
}
