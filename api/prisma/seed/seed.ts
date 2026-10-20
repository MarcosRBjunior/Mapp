import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadDbEnv } from '../../src/config/db-env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { loadAliasSeeds } from './aliases.js';
import type { CountrySeed } from './reference.js';

const API_NINJAS_SOURCE = {
  code: 'api_ninjas',
  name: 'API Ninjas — COVID-19',
  url: 'https://api-ninjas.com/api/covid19',
  license:
    'Termos de uso da API Ninjas (plano gratuito: exige atribuição; não permite cache nem armazenamento)',
  attribution: 'Dados: API Ninjas (fonte original: JHU CSSE)',
};

const env = loadDbEnv();
const logger = createLogger('info');
const countries = JSON.parse(
  readFileSync(new URL('./countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];
const aliases = loadAliasSeeds();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL_SYNC }),
});

try {
  await prisma.$transaction(
    async (tx) => {
      const source = await tx.dataSource.upsert({
        where: { code: API_NINJAS_SOURCE.code },
        create: API_NINJAS_SOURCE,
        update: API_NINJAS_SOURCE,
      });

      for (const country of countries) {
        const data = {
          name: country.name,
          kind: country.kind,
          lat: country.lat,
          lng: country.lng,
          population: country.population === null ? null : BigInt(country.population),
        };
        await tx.country.upsert({
          where: { code: country.code },
          create: { code: country.code, ...data },
          update: data,
        });
      }

      // Only the curated file is applied; aliases outside it (e.g. pending ones) stay untouched.
      for (const alias of aliases) {
        await tx.countryAlias.upsert({
          where: { sourceId_sourceName: { sourceId: source.id, sourceName: alias.sourceName } },
          create: { sourceId: source.id, ...alias },
          update: { countryCode: alias.countryCode, status: alias.status },
        });
      }
    },
    { timeout: 60_000 },
  );
  logger.info(
    { countries: countries.length, aliases: aliases.length, source: API_NINJAS_SOURCE.code },
    'seed complete',
  );
} finally {
  await prisma.$disconnect();
}
