import { readFileSync, writeFileSync } from 'node:fs';
import { buildCountrySeeds } from './reference.js';

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error('usage: npm run seed:build -w api -- <path/to/UID_ISO_FIPS_LookUp_Table.csv>');
  process.exit(1);
}

const seeds = buildCountrySeeds(readFileSync(inputPath, 'utf8'));
const outputUrl = new URL('./countries.json', import.meta.url);
writeFileSync(outputUrl, `${JSON.stringify(seeds, null, 2)}\n`);
console.log(`wrote ${seeds.length} entries to ${outputUrl.pathname}`);
