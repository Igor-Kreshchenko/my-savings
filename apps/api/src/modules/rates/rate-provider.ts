import type { Rate } from '@my-savings/shared';

export interface RateProvider {
  getRate(date: string): Promise<Rate | null>;
}
