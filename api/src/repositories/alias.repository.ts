import type { AliasStatus } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface AliasRecord {
  status: AliasStatus;
  countryCode: string | null;
}

export async function loadAliases(db: Db, sourceId: number): Promise<Map<string, AliasRecord>> {
  const rows = await db.countryAlias.findMany({
    where: { sourceId },
    select: { sourceName: true, status: true, countryCode: true },
  });
  return new Map(
    rows.map((row) => [row.sourceName, { status: row.status, countryCode: row.countryCode }]),
  );
}

// ON CONFLICT DO NOTHING: an existing alias (mapped, ignored or pending) is never changed here.
export async function insertPendingAliases(
  db: Db,
  sourceId: number,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) {
    return;
  }
  await db.countryAlias.createMany({
    data: names.map((sourceName) => ({ sourceId, sourceName, status: 'pending' as const })),
    skipDuplicates: true,
  });
}
