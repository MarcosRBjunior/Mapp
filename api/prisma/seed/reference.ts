export type CountryKind = 'country' | 'non_geographic';

export interface CountrySeed {
  code: string;
  name: string;
  kind: CountryKind;
  lat: number | null;
  lng: number | null;
  population: number | null;
  sourceName: string;
}

const NON_GEOGRAPHIC: ReadonlyMap<string, { code: string; name: string }> = new Map([
  ['Diamond Princess', { code: 'XDP', name: 'Navio Diamond Princess' }],
  ['MS Zaandam', { code: 'XMZ', name: 'Navio MS Zaandam' }],
  ['Summer Olympics 2020', { code: 'XSO', name: 'Jogos Olímpicos de Verão 2020' }],
  ['Winter Olympics 2022', { code: 'XWO', name: 'Jogos Olímpicos de Inverno 2022' }],
]);

const NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['CD', 'República Democrática do Congo'],
  ['MM', 'Mianmar'],
]);

const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region', fallback: 'none' });

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input.charAt(i);
    if (inQuotes) {
      if (char === '"' && input.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input.charAt(i + 1) === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface Columns {
  iso2: number;
  iso3: number;
  admin2: number;
  province: number;
  country: number;
  lat: number;
  lng: number;
  population: number;
}

function cell(row: string[], index: number): string {
  return row[index] ?? '';
}

function coordinate(value: string, limit: number, sourceName: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(parsed) || Math.abs(parsed) > limit) {
    throw new Error(`Invalid coordinate "${value}" for ${sourceName}`);
  }
  return parsed;
}

function population(value: string, sourceName: string): number | null {
  if (value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid population "${value}" for ${sourceName}`);
  }
  return parsed;
}

function toSeed(row: string[], columns: Columns): CountrySeed {
  const sourceName = cell(row, columns.country);
  const iso3 = cell(row, columns.iso3);

  if (iso3 === '') {
    const entity = NON_GEOGRAPHIC.get(sourceName);
    if (!entity) {
      throw new Error(`Row without iso3 and no non-geographic mapping: ${sourceName}`);
    }
    return {
      ...entity,
      kind: 'non_geographic',
      lat: null,
      lng: null,
      population: null,
      sourceName,
    };
  }

  const iso2 = cell(row, columns.iso2);
  const name = NAME_OVERRIDES.get(iso2) ?? regionNames.of(iso2);
  if (!name) {
    throw new Error(`No pt-BR name for ${iso2} (${sourceName})`);
  }
  return {
    code: iso3,
    name,
    kind: 'country',
    lat: coordinate(cell(row, columns.lat), 90, sourceName),
    lng: coordinate(cell(row, columns.lng), 180, sourceName),
    population: population(cell(row, columns.population), sourceName),
    sourceName,
  };
}

export function buildCountrySeeds(csvText: string): CountrySeed[] {
  const [header, ...rows] = parseCsv(csvText).filter((row) => row.some((value) => value !== ''));
  if (!header) {
    throw new Error('Empty reference CSV');
  }
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index === -1) {
      throw new Error(`Missing column ${name}`);
    }
    return index;
  };
  const columns: Columns = {
    iso2: column('iso2'),
    iso3: column('iso3'),
    admin2: column('Admin2'),
    province: column('Province_State'),
    country: column('Country_Region'),
    lat: column('Lat'),
    lng: column('Long_'),
    population: column('Population'),
  };

  const seeds = rows
    .filter((row) => cell(row, columns.province) === '' && cell(row, columns.admin2) === '')
    .map((row) => toSeed(row, columns));

  const seen = new Set<string>();
  for (const seed of seeds) {
    if (seen.has(seed.code)) {
      throw new Error(`Duplicate country code ${seed.code}`);
    }
    seen.add(seed.code);
  }
  return seeds.sort((a, b) => a.code.localeCompare(b.code));
}
