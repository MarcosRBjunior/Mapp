import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { toCountryGeo, type FeatureCollection, type SourceProperties } from './geo.js';

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error('usage: npm run geo:build -w web -- <path/to/ne_110m_admin_0_countries.geojson>');
  process.exit(1);
}

const source = JSON.parse(readFileSync(inputPath, 'utf8')) as FeatureCollection<SourceProperties>;
const output = toCountryGeo(source);
const outputUrl = new URL('../public/geo/countries-110m.geojson', import.meta.url);
mkdirSync(new URL('.', outputUrl), { recursive: true });
writeFileSync(outputUrl, `${JSON.stringify(output)}\n`);
console.log(`wrote ${output.features.length} features to ${outputUrl.pathname}`);
