import { z } from 'zod';
import { AppError } from './app-error.js';

export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('Request validation failed', 400, 'VALIDATION_ERROR');
  }
  return result.data;
}
