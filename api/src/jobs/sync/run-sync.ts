import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { failOrphanRuns } from '../../repositories/sync-run.repository.js';
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
    const interrupted = await failOrphanRuns(deps.prisma);
    if (interrupted.length > 0) {
      deps.logger.warn({ runIds: interrupted }, 'marked interrupted runs as failed');
      // A dead run may have written rows without refreshing the view.
      await refreshGlobalDailyStat(deps.prisma);
    }
    const plan = deps.mode === 'full' ? fullPlan(deps.source) : snapshotPlan(deps.source);
    return await runUnits({ ...deps, signal: lock.lost }, plan);
  } finally {
    await bestEffort(deps.logger, 'release sync lock', () => lock.release());
  }
}
