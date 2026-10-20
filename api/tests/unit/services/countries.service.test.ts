import { describe, expect, it } from 'vitest';
import { createServices } from '../../../src/services/create-services.js';
import { createFakeRepositories } from '../../helpers/fake-repositories.js';

const services = () => createServices(createFakeRepositories(), 'api_ninjas');

describe('countries service: list', () => {
  it('lists every country by pt-BR name with nulls when there is no data', async () => {
    expect(await services().countries.listCountries('cases', undefined)).toEqual({
      date: '2023-03-09',
      metric: 'cases',
      countries: [
        { code: 'ARG', name: 'Argentina', lat: -38.4, lng: -63.6, total: 100, new: 5 },
        { code: 'BRA', name: 'Brasil', lat: -14.2, lng: -51.9, total: 100, new: 10 },
        { code: 'ESH', name: 'Saara Ocidental', lat: 24.2, lng: -12.9, total: null, new: null },
      ],
    });
  });

  it('uses the requested metric', async () => {
    const list = await services().countries.listCountries('deaths', undefined);
    expect(list.countries.find((country) => country.code === 'ARG')?.total).toBe(20);
  });
});

describe('countries service: detail', () => {
  it('returns values, share and rank (tie broken by name)', async () => {
    expect(await services().countries.getCountry('BRA', undefined)).toEqual({
      date: '2023-03-09',
      country: { code: 'BRA', name: 'Brasil', lat: -14.2, lng: -51.9, population: 212000000 },
      cases: { total: 100, new: 10 },
      deaths: { total: 10, new: 1 },
      comparison: {
        cases: { share: 40, rank: 2, rankedCount: 2 },
        deaths: { share: 28.6, rank: 2, rankedCount: 2 },
      },
    });
  });

  it('returns a null share when the global is 0', async () => {
    const detail = await services().countries.getCountry('BRA', '2023-03-08');
    expect(detail.comparison).toEqual({
      cases: { share: 100, rank: 1, rankedCount: 1 },
      deaths: { share: null, rank: 1, rankedCount: 1 },
    });
  });

  it('returns nulls for a country without data', async () => {
    const detail = await services().countries.getCountry('ESH', undefined);
    expect(detail.cases).toBeNull();
    expect(detail.deaths).toBeNull();
    expect(detail.comparison.cases).toEqual({ share: null, rank: null, rankedCount: 2 });
  });

  it.each(['XYZ', 'XDP'])('rejects %s with COUNTRY_NOT_FOUND', async (code) => {
    await expect(services().countries.getCountry(code, undefined)).rejects.toMatchObject({
      code: 'COUNTRY_NOT_FOUND',
      httpStatus: 404,
      details: { code },
    });
  });
});
