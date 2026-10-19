import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const emptyAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyAsUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  PORT: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535))
      .default(3333),
  ),
  LOG_LEVEL: z.preprocess(emptyAsUndefined, z.enum(logLevels).default('info')),
});

export type LogLevel = (typeof logLevels)[number];
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
