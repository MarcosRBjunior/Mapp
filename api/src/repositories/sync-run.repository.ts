import type { SyncMode, SyncStatus } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export const INTERRUPTED_ERROR = 'interrompido: o processo anterior terminou sem fechar o run';

export async function startRun(
  db: Db,
  input: { sourceId: number; mode: SyncMode; referenceDate: string },
): Promise<number> {
  const run = await db.syncRun.create({
    data: {
      sourceId: input.sourceId,
      mode: input.mode,
      status: 'running',
      referenceDate: new Date(`${input.referenceDate}T00:00:00.000Z`),
    },
    select: { id: true },
  });
  return run.id;
}

export interface ClosedOrphan {
  id: number;
  status: 'partial' | 'failed';
}

// Only safe while holding the sync lock: no live process owns a 'running' row then.
export async function findOrphanRunIds(db: Db): Promise<number[]> {
  const orphans = await db.syncRun.findMany({
    where: { status: 'running' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return orphans.map((orphan) => orphan.id);
}

// A done checkpoint means the run wrote data (rows and checkpoint share a transaction), so it
// closes as partial and counts for the dataVersion; otherwise it failed.
export async function closeOrphanRuns(db: Db): Promise<ClosedOrphan[]> {
  const orphans = await findOrphanRunIds(db);
  const closed: ClosedOrphan[] = [];
  for (const orphanId of orphans) {
    const [callsUsed, doneUnits] = await Promise.all([
      db.providerCall.count({ where: { syncRunId: orphanId } }),
      db.syncCheckpoint.count({ where: { syncRunId: orphanId, status: 'done' } }),
    ]);
    const status = doneUnits > 0 ? 'partial' : 'failed';
    await db.syncRun.update({
      where: { id: orphanId },
      data: { status, finishedAt: new Date(), error: INTERRUPTED_ERROR, callsUsed },
    });
    closed.push({ id: orphanId, status });
  }
  return closed;
}

export async function finishRun(
  db: Db,
  runId: number,
  result: { status: Exclude<SyncStatus, 'running'>; error: string | null },
): Promise<number> {
  const callsUsed = await db.providerCall.count({ where: { syncRunId: runId } });
  await db.syncRun.update({
    where: { id: runId },
    data: { status: result.status, error: result.error, finishedAt: new Date(), callsUsed },
  });
  return callsUsed;
}

export async function startCheckpoint(db: Db, runId: number, unit: string): Promise<void> {
  await db.syncCheckpoint.upsert({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    create: { syncRunId: runId, unit, status: 'pending', attempts: 1 },
    update: { status: 'pending', attempts: { increment: 1 }, errorMessage: null },
  });
}

export async function completeCheckpoint(db: Db, runId: number, unit: string): Promise<void> {
  await db.syncCheckpoint.update({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    data: { status: 'done', errorMessage: null },
  });
}

export async function failCheckpoint(
  db: Db,
  runId: number,
  unit: string,
  message: string,
): Promise<void> {
  await db.syncCheckpoint.update({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    data: { status: 'error', errorMessage: message },
  });
}

// Units already loaded by any run of this source and mode (the historical series never changes).
export async function findDoneUnits(
  db: Db,
  sourceId: number,
  mode: SyncMode,
): Promise<Set<string>> {
  const rows = await db.syncCheckpoint.findMany({
    where: { status: 'done', syncRun: { sourceId, mode } },
    select: { unit: true },
    distinct: ['unit'],
  });
  return new Set(rows.map((row) => row.unit));
}
