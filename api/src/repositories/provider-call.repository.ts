import type { CallOutcome } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface ProviderCallInput {
  endpoint: string;
  statusCode: number | null;
  durationMs: number;
  outcome: CallOutcome;
}

export interface ProviderCallRepository {
  countUsage(): Promise<{ lastHour: number; thisMonth: number }>;
  record(call: ProviderCallInput): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export function createProviderCallStore(
  db: Db,
  scope: { sourceId: number; syncRunId: number },
): ProviderCallRepository {
  return {
    // One query with the database clock: the last hour and the UTC calendar month.
    async countUsage() {
      const [row] = await db.$queryRaw<{ lastHour: number; thisMonth: number }[]>`
        SELECT
          count(*) FILTER (WHERE called_at >= now() - interval '1 hour')::int AS "lastHour",
          count(*) FILTER (
            WHERE called_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )::int AS "thisMonth"
        FROM provider_call
        WHERE source_id = ${scope.sourceId}
          AND called_at >= least(
            now() - interval '1 hour',
            date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )`;
      return { lastHour: row?.lastHour ?? 0, thisMonth: row?.thisMonth ?? 0 };
    },
    async record(call) {
      const row = await db.providerCall.create({
        data: { sourceId: scope.sourceId, syncRunId: scope.syncRunId, ...call },
        select: { id: true },
      });
      return row.id;
    },
    async markInvalidPayload(id) {
      await db.providerCall.update({ where: { id }, data: { outcome: 'invalid_payload' } });
    },
  };
}
