import { readFileSync } from 'node:fs';
import { loadDbEnv } from '../../src/config/db-env.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { loadAliasSeeds } from './aliases.js';
import type { CountrySeed } from './reference.js';

// Both sources share the curated aliases: API Ninjas serves the JHU CSSE names unchanged.
const SOURCES = [
  {
    code: 'jhu_csv',
    name: 'JHU CSSE — COVID-19 Data Repository',
    url: 'https://github.com/CSSEGISandData/COVID-19',
    license: 'CC BY 4.0',
    attribution:
      'Dados: COVID-19 Data Repository by the Center for Systems Science and Engineering (CSSE) at Johns Hopkins University',
  },
  {
    code: 'api_ninjas',
    name: 'API Ninjas — COVID-19',
    url: 'https://api-ninjas.com/api/covid19',
    license:
      'Termos de uso da API Ninjas (plano gratuito: exige atribuição; não permite cache nem armazenamento)',
    attribution: 'Dados: API Ninjas (fonte original: JHU CSSE)',
  },
];

const env = loadDbEnv();
const logger = createLogger('info');
const countries = JSON.parse(
  readFileSync(new URL('./countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];
const aliases = loadAliasSeeds();

const prisma = createPrisma(env.DATABASE_URL_SYNC);

try {
  await prisma.$transaction(
    async (tx) => {
      // One statement per table instead of one upsert per row: the seed also runs far from the
      // database (db.yml on GitHub, the database in São Paulo).
      await tx.$executeRaw`
        INSERT INTO country (code, name, kind, lat, lng, population)
        SELECT * FROM unnest(
          ${countries.map((c) => c.code)}::text[],
          ${countries.map((c) => c.name)}::text[],
          ${countries.map((c) => c.kind)}::text[]::country_kind[],
          ${countries.map((c) => c.lat)}::float8[],
          ${countries.map((c) => c.lng)}::float8[],
          ${countries.map((c) => (c.population === null ? null : String(c.population)))}::bigint[]
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name, kind = EXCLUDED.kind, lat = EXCLUDED.lat,
          lng = EXCLUDED.lng, population = EXCLUDED.population`;

      for (const data of SOURCES) {
        const source = await tx.dataSource.upsert({
          where: { code: data.code },
          create: data,
          update: data,
        });
        // Only the curated file is applied; aliases outside it (e.g. pending ones) stay untouched.
        await tx.$executeRaw`
          INSERT INTO country_alias (source_id, source_name, country_code, status)
          SELECT ${source.id}, t.name, t.code, t.status::alias_status
          FROM unnest(
            ${aliases.map((a) => a.sourceName)}::text[],
            ${aliases.map((a) => a.countryCode)}::text[],
            ${aliases.map((a) => a.status)}::text[]
          ) AS t(name, code, status)
          ON CONFLICT (source_id, source_name) DO UPDATE SET
            country_code = EXCLUDED.country_code, status = EXCLUDED.status`;
      }
    },
    { timeout: 60_000 },
  );
  logger.info(
    {
      countries: countries.length,
      aliases: aliases.length,
      sources: SOURCES.map((source) => source.code),
    },
    'seed complete',
  );
} finally {
  await prisma.$disconnect();
}
