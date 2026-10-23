import { Prisma } from '../generated/prisma/client.js';

// RN-06: a date is complete when both metrics reach their own N, the highest country_count
// of that metric in the view. Coverage, date validation and series use only these dates.
export function completeDatesSql(sourceId: number): Prisma.Sql {
  return Prisma.sql`
    SELECT g.stat_date
    FROM global_daily_stat g
    JOIN (
      SELECT metric, max(country_count) AS n
      FROM global_daily_stat
      WHERE source_id = ${sourceId}
      GROUP BY metric
    ) n ON n.metric = g.metric
    WHERE g.source_id = ${sourceId} AND g.country_count = n.n
    GROUP BY g.stat_date
    HAVING count(*) = 2`;
}
