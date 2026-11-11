export const REQUIRED_COLLATION = 'pt-BR-x-icu';
// Postgres 18 skip scan keeps the ranking queries on the current daily_stat index.
export const SKIP_SCAN_VERSION_NUM = 180000;

export interface DatabaseFacts {
  versionNum: number;
  hasIcuCollation: boolean;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

export function evaluateDatabase(facts: DatabaseFacts): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!facts.hasIcuCollation) {
    errors.push(
      `collation "${REQUIRED_COLLATION}" not found: rankings and country lists sort with it (the server needs ICU)`,
    );
  }
  if (facts.versionNum < SKIP_SCAN_VERSION_NUM) {
    warnings.push(
      `Postgres older than 18 (server_version_num ${facts.versionNum}): measure /rankings and /countries again and consider an index on daily_stat (source_id, stat_date)`,
    );
  }
  return { errors, warnings };
}
