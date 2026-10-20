import { describe, expect, it } from 'vitest';
import { createServices } from '../../../src/services/create-services.js';
import { createFakeRepositories, FAKE_SOURCE } from '../../helpers/fake-repositories.js';

describe('meta service', () => {
  it('describes source, coverage, last sync and dataVersion', async () => {
    const { meta } = createServices(createFakeRepositories(), 'api_ninjas');

    expect(await meta.getMeta()).toEqual({
      source: {
        code: FAKE_SOURCE.code,
        name: FAKE_SOURCE.name,
        url: FAKE_SOURCE.url,
        license: FAKE_SOURCE.license,
        attribution: FAKE_SOURCE.attribution,
      },
      coverage: { from: '2023-03-08', to: '2023-03-09', countries: 3 },
      referenceDate: '2023-03-09',
      lastSync: {
        status: 'partial',
        mode: 'snapshot',
        startedAt: '2026-10-20T10:00:00.000Z',
        finishedAt: '2026-10-20T10:00:05.000Z',
      },
      dataVersion: 7,
      nonGeographic: [{ code: 'XDP', name: 'Navio Diamond Princess' }],
    });
  });

  it('returns nulls when no data is loaded', async () => {
    const { meta } = createServices(createFakeRepositories({ ready: false }), 'api_ninjas');

    expect(await meta.getMeta()).toMatchObject({
      coverage: null,
      referenceDate: null,
      lastSync: null,
      dataVersion: null,
      nonGeographic: [{ code: 'XDP', name: 'Navio Diamond Princess' }],
    });
  });
});
