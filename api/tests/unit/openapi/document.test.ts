import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createOpenApiDocument,
  OPENAPI_YAML_PATH,
  renderOpenApiYaml,
} from '../../../src/openapi/document.js';

describe('OpenAPI document', () => {
  it('documents every route', () => {
    expect(Object.keys(createOpenApiDocument().paths ?? {})).toEqual([
      '/health',
      '/ready',
      '/api/v1/meta',
      '/api/v1/global',
      '/api/v1/countries',
      '/api/v1/countries/{code}',
      '/api/v1/rankings',
    ]);
  });

  it('matches docs/openapi.yaml (run `npm run openapi -w api` after changing a schema)', () => {
    expect(readFileSync(OPENAPI_YAML_PATH, 'utf8')).toBe(renderOpenApiYaml());
  });
});
