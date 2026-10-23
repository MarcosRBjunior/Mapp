import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { closeOrphanRuns } from '../../repositories/sync-run.repository.js';
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
    const closed = await closeOrphanRuns(deps.prisma);
    if (closed.length > 0) {
      deps.logger.warn({ runs: closed }, 'closed interrupted runs');
      // A dead run may have written rows without refreshing the view.
      await bestEffort(deps.logger, 'refresh global view after orphan recovery', () =>
        refreshGlobalDailyStat(deps.prisma),
      );
    }
    const plan = deps.mode === 'full' ? fullPlan(deps.source) : snapshotPlan(deps.source);
    return await runUnits({ ...deps, signal: lock.lost }, plan);
  } finally {
    await bestEffort(deps.logger, 'release sync lock', () => lock.release());
  }
}
