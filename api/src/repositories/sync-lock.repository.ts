import pg from 'pg';

// 'mapp' in hexadecimal (0x6d617070). Session-level lock: it dies with the connection.
export const SYNC_LOCK_KEY = 1_835_102_320;

export interface SyncLock {
  // Aborted when the lock connection dies: the run must stop writing.
  readonly lost: AbortSignal;
  release(): Promise<void>;
}

export async function tryAcquireSyncLock(connectionString: string): Promise<SyncLock | null> {
  const client = new pg.Client({ connectionString });
  const lost = new AbortController();
  let releasing = false;
  client.on('error', (error) => {
    lost.abort(error);
  });
  client.on('end', () => {
    if (!releasing) {
      lost.abort(new Error('sync lock connection ended'));
    }
  });
  await client.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [SYNC_LOCK_KEY],
    );
    locked = result.rows[0]?.locked === true;
  } finally {
    if (!locked) {
      releasing = true;
      await client.end();
    }
  }
  if (!locked) {
    return null;
  }
  return {
    lost: lost.signal,
    async release() {
      releasing = true;
      if (lost.signal.aborted) {
        // The session is gone and the lock died with it.
        await client.end().catch(() => undefined);
        return;
      }
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
      } finally {
        await client.end();
      }
    },
  };
}
