import { z } from 'zod';

const configSchema = z.object({
  API_TOKEN: z.string().min(1),
  DB_PATH: z.string().min(1).default('./data/my-savings.sqlite'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TZ: z.literal('Europe/Kyiv').default('Europe/Kyiv'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
