// Natural Earth polygons whose ISO3 is not a country in the database open the sovereign
// country (decision of 2026-10-21). TKM is sovereign but has no data, so it has no link.
export const SOVEREIGN: Readonly<Record<string, string>> = {
  GRL: 'DNK',
  PRI: 'USA',
  FLK: 'GBR',
  NCL: 'FRA',
  ATF: 'FRA',
  SOL: 'SOM',
  CYN: 'CYP',
};

export function resolvePolygonCode(iso3: string, knownCodes: ReadonlySet<string>): string | null {
  if (knownCodes.has(iso3)) return iso3;
  const sovereign = SOVEREIGN[iso3];
  return sovereign !== undefined && knownCodes.has(sovereign) ? sovereign : null;
}
