// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_URL, renderApiTypes } from './api-types.js';

describe('generated API types', () => {
  it('match docs/openapi.yaml (run npm run api:types -w web if this fails)', async () => {
    const expected = await renderApiTypes();
    const actual = readFileSync(SCHEMA_URL, 'utf8');

    expect(actual).toBe(expected);
  });
});
