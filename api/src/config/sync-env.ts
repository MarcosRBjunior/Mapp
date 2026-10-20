import { z } from 'zod';
import { postgresUrl } from './db-env.js';
import { emptyAsUndefined, logLevels } from './env.js';

const callLimit = (fallback: number) =>
  z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1)).default(fallback),
  );

const syncEnvSchema = z
  .object({
    DATABASE_URL_SYNC: postgresUrl,
    DATA_PROVIDER: z.preprocess(
      emptyAsUndefined,
      z.enum(['api_ninjas', 'jhu_csv', 'apify']).default('api_ninjas'),
    ),
    API_NINJAS_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
    SYNC_CALLS_PER_HOUR: callLimit(90),
    SYNC_CALLS_PER_MONTH: callLimit(3000),
    LOG_LEVEL: z.preprocess(emptyAsUndefined, z.enum(logLevels).default('info')),
  })
  .refine((env) => env.DATA_PROVIDER !== 'api_ninjas' || env.API_NINJAS_KEY !== undefined, {
    message: 'API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas',
    path: ['API_NINJAS_KEY'],
  });

export type SyncEnv = z.infer<typeof syncEnvSchema>;

export function loadSyncEnv(source: NodeJS.ProcessEnv = process.env): SyncEnv {
  const result = syncEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid sync environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
