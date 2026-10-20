import type { Db } from '../lib/prisma.js';

export async function findSourceId(db: Db, code: string): Promise<number | null> {
  const source = await db.dataSource.findUnique({ where: { code }, select: { id: true } });
  return source?.id ?? null;
}
