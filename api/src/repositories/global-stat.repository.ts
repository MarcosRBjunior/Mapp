import type { Db } from '../lib/prisma.js';

export async function refreshGlobalDailyStat(db: Db): Promise<void> {
  await db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY global_daily_stat`;
}
