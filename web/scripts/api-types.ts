import { readFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';

export const OPENAPI_URL = new URL('../../docs/openapi.yaml', import.meta.url);
export const SCHEMA_URL = new URL('../src/shared/api/schema.d.ts', import.meta.url);

export async function renderApiTypes(): Promise<string> {
  const ast = await openapiTS(readFileSync(OPENAPI_URL, 'utf8'));
  return astToString(ast);
}
