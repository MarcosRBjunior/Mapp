import { mkdirSync, writeFileSync } from 'node:fs';
import { SCHEMA_URL, renderApiTypes } from './api-types.js';

mkdirSync(new URL('.', SCHEMA_URL), { recursive: true });
writeFileSync(SCHEMA_URL, await renderApiTypes());
console.log(`wrote ${SCHEMA_URL.pathname}`);
