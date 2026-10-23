import type { Db } from '../lib/prisma.js';

export interface LastSyncRecord {
  id: number;
  status: 'success' | 'partial' | 'failed';
  mode: 'snapshot' | 'full';
  startedAt: Date;
  finishedAt: Date;
}

export interface EntityName {
  code: string;
  name: string;
}

export interface MetaRepository {
  findLastFinishedSync(sourceId: number): Promise<LastSyncRecord | null>;
  listNonGeographic(): Promise<EntityName[]>;
}

export function createMetaRepository(db: Db): MetaRepository {
  return {
    async findLastFinishedSync(sourceId) {
      const run = await db.syncRun.findFirst({
        where: { sourceId, finishedAt: { not: null } },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, mode: true, startedAt: true, finishedAt: true },
      });
      if (!run?.finishedAt || run.status === 'running') return null;
      return {
        id: run.id,
        status: run.status,
        mode: run.mode,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      };
    },

    listNonGeographic: () =>
      db.country.findMany({
        where: { kind: 'non_geographic' },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
  };
}
