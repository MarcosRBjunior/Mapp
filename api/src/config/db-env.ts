import { z } from 'zod';

export const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// URL');

const dbEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_URL_SYNC: postgresUrl,
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  const result = dbEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid database environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
