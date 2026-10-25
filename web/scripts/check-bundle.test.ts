// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findForbidden } from './check-bundle.js';

describe('findForbidden', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('passes a clean build', async () => {
    await writeFile(path.join(dir, 'index.html'), '<script src="/assets/app.js"></script>');
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'assets', 'app.js'),
      'fetch("http://localhost:3333/api/v1/meta")',
    );

    expect(await findForbidden(dir)).toEqual([]);
  });

  it('finds the source host, the key name and the key header in any file', async () => {
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'assets', 'app.js'),
      'fetch("https://api.api-ninjas.com/v1/covid19",{headers:{"x-api-key":k}})',
    );
    await writeFile(path.join(dir, 'env.txt'), 'API_NINJAS_KEY=fake');

    expect(await findForbidden(dir)).toEqual([
      { file: path.join('assets', 'app.js'), text: 'api-ninjas.com' },
      { file: path.join('assets', 'app.js'), text: 'X-Api-Key' },
      { file: 'env.txt', text: 'API_NINJAS_KEY' },
    ]);
  });
});
