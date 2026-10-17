import { z } from 'zod';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];

    return day >= 1 && day <= (daysInMonth[month - 1] ?? 0);
  });

const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const rateSchema = z.object({
  date: dateSchema,
  currency: currencySchema,
  rateBuy: z.number().positive(),
  rateSell: z.number().positive().nullable(),
  source: z.string().min(1),
  fetchedAt: z.string().datetime({ offset: true }),
});

export const rateRefreshResponseSchema = z.object({
  date: dateSchema,
  rateBuy: z.number().positive(),
  rateSell: z.number().positive().nullable(),
  fetchedAt: z.string().datetime({ offset: true }),
  stale: z.boolean(),
});

export const positionSchema = z.object({
  id: z.number().int().positive(),
  currency: currencySchema,
  baseDate: dateSchema,
  baseRate: z.number().positive(),
  note: z.string().nullable(),
});

export const createPositionSchema = z.object({
  currency: currencySchema,
  baseDate: dateSchema,
  baseRate: z.number().positive(),
  note: z.string().nullable().optional(),
});

export const balanceEventSchema = z.object({
  id: z.number().int().positive(),
  positionId: z.number().int().positive(),
  date: dateSchema,
  deltaCents: z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0),
  note: z.string().nullable(),
});

export const createBalanceEventSchema = z.object({
  date: dateSchema,
  deltaCents: z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0),
  note: z.string().nullable().optional(),
});

export const ratesQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine(
    ({ from, to }) => from === undefined || to === undefined || from <= to,
    { message: '`from` must be on or before `to`' },
  );

export const analyticsQuerySchema = z
  .object({
    positionId: z.coerce.number().int().positive(),
    from: dateSchema,
    to: dateSchema,
  })
  .refine(({ from, to }) => from <= to, {
    message: '`from` must be on or before `to`',
  });

export const analyticsResponseSchema = z.object({
  series: z.array(
    z.object({
      date: dateSchema,
      rate: z.number().positive(),
      usd: z.number().nonnegative(),
      uah: z.number().nonnegative(),
      estimated: z.boolean(),
    }),
  ),
  daily: z.object({
    uahChange: z.number().nullable(),
    rateChange: z.number().nullable(),
  }),
  period: z.object({
    uahChange: z.number(),
  }),
  pnl: z.object({
    netUah: z.number().nullable(),
    netPercent: z.number().nullable(),
    fxUah: z.number(),
    cashFlowUah: z.number(),
  }),
  stats: z.object({
    minRate: z.number().positive().nullable(),
    maxRate: z.number().positive().nullable(),
    maxDrawdown: z.number().nonnegative().nullable(),
    movingAverage7: z.number().positive().nullable(),
    movingAverage30: z.number().positive().nullable(),
  }),
});

export const clearDataResponseSchema = z.object({
  status: z.literal('cleared'),
});
