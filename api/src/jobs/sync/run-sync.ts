import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { failOrphanRuns } from '../../repositories/sync-run.repository.js';
import { runSnapshot, type SnapshotDeps, type SyncResult } from './run-snapshot.js';

export class SyncLockedError extends Error {
  constructor() {
    super('Another sync is running (advisory lock held)');
    this.name = 'SyncLockedError';
  }
}

export interface RunSyncDeps extends SnapshotDeps {
  lockUrl: string;
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
    }
    return await runSnapshot(deps);
  } finally {
    await lock.release();
  }
}
