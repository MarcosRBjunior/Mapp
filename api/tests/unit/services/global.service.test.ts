import { describe, expect, it } from 'vitest';
import { createServices } from '../../../src/services/create-services.js';
import { createFakeRepositories } from '../../helpers/fake-repositories.js';

describe('global service', () => {
  it('returns both metrics on the reference date by default', async () => {
    const { global } = createServices(createFakeRepositories(), 'api_ninjas');

    expect(await global.getGlobal(undefined)).toEqual({
      date: '2023-03-09',
      cases: { total: 250, new: 15 },
      deaths: { total: 35, new: 3 },
      countryCount: 3,
    });
  });

  it('returns an earlier date inside the coverage', async () => {
    const { global } = createServices(createFakeRepositories(), 'api_ninjas');

    expect((await global.getGlobal('2023-03-08')).cases).toEqual({ total: 90, new: 9 });
  });
});
