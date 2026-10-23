import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { closeOrphanRuns, findOrphanRunIds } from '../../repositories/sync-run.repository.js';
import { bestEffort } from './best-effort.js';
import type { SyncMode } from './cli-args.js';
import { fullPlan } from './full-plan.js';
import { runUnits, type RunUnitsDeps, type SyncResult } from './run-units.js';
import { snapshotPlan } from './snapshot-plan.js';

export class SyncLockedError extends Error {
  constructor() {
    super('Another sync is running (advisory lock held)');
    this.name = 'SyncLockedError';
  }
}

export interface RunSyncDeps extends RunUnitsDeps {
  lockUrl: string;
  mode: SyncMode;
}

export async function runSync(deps: RunSyncDeps): Promise<SyncResult> {
  const lock = await tryAcquireSyncLock(deps.lockUrl);
  if (lock === null) {
    throw new SyncLockedError();
  }
  try {
    // A dead run may have written rows without refreshing the view. The refresh must succeed
    // before closing it: closing bumps the dataVersion, so readers never see the new version over
    // a stale view. If the refresh throws, the orphans stay 'running' and the next run retries.
    const orphanIds = await findOrphanRunIds(deps.prisma);
    if (orphanIds.length > 0) {
      await refreshGlobalDailyStat(deps.prisma);
      const closed = await closeOrphanRuns(deps.prisma, orphanIds);
      deps.logger.warn({ runs: closed }, 'closed interrupted runs');
    }
    const plan = deps.mode === 'full' ? fullPlan(deps.source) : snapshotPlan(deps.source);
    return await runUnits({ ...deps, signal: lock.lost }, plan);
  } finally {
    await bestEffort(deps.logger, 'release sync lock', () => lock.release());
  }
}
