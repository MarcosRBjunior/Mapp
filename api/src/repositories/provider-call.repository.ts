import type { CallOutcome } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface ProviderCallInput {
  endpoint: string;
  statusCode: number | null;
  durationMs: number;
  outcome: CallOutcome;
}

export interface ProviderCallRepository {
  countSince(since: Date): Promise<number>;
  record(call: ProviderCallInput): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export function createProviderCallStore(
  db: Db,
  scope: { sourceId: number; syncRunId: number },
): ProviderCallRepository {
  return {
    countSince: (since) =>
      db.providerCall.count({ where: { sourceId: scope.sourceId, calledAt: { gte: since } } }),
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
