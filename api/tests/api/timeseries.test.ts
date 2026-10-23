import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  countryTimeseriesResponseSchema,
  errorResponseSchema,
  globalTimeseriesResponseSchema,
} from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/global/timeseries', () => {
  it('returns the whole coverage by day by default', async () => {
    const response = await request(createTestApp()).get('/api/v1/global/timeseries');

    expect(response.status).toBe(200);
    expect(globalTimeseriesResponseSchema.parse(response.body)).toEqual({
      metric: 'cases',
      granularity: 'day',
      from: '2023-03-08',
      to: '2023-03-09',
      points: [
        { date: '2023-03-08', total: 90, new: 9 },
        { date: '2023-03-09', total: 250, new: 15 },
      ],
    });
  });

  it('rejects from after to', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/global/timeseries?from=2023-03-09&to=2023-03-08',
    );

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.message).toBe(
      'from must not be after to',
    );
  });

  it('rejects a range outside the coverage', async () => {
    const response = await request(createTestApp()).get('/api/v1/global/timeseries?to=2023-03-10');

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.details).toEqual({
      from: '2023-03-08',
      to: '2023-03-09',
    });
  });

  it('rejects an unknown granularity', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/global/timeseries?granularity=year',
    );

    expect(response.status).toBe(400);
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get(
      '/api/v1/global/timeseries',
    );

    expect(response.status).toBe(503);
  });
});

describe('GET /api/v1/countries/:code/timeseries', () => {
  it('returns the country series, normalizing the code', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/countries/bra/timeseries?metric=deaths&granularity=week',
    );

    expect(response.status).toBe(200);
    expect(countryTimeseriesResponseSchema.parse(response.body)).toEqual({
      country: { code: 'BRA', name: 'Brasil' },
      metric: 'deaths',
      granularity: 'week',
      from: '2023-03-08',
      to: '2023-03-09',
      points: [
        { date: '2023-03-08', total: 0, new: 0 },
        { date: '2023-03-09', total: 10, new: 1 },
      ],
    });
  });

  it('returns no points for a country without data', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/ESH/timeseries');

    expect(response.status).toBe(200);
    expect(countryTimeseriesResponseSchema.parse(response.body).points).toEqual([]);
  });

  it.each(['XYZ', 'XDP'])('responds 404 for %s', async (code) => {
    const response = await request(createTestApp()).get(`/api/v1/countries/${code}/timeseries`);

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('rejects a malformed code', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/BR/timeseries');

    expect(response.status).toBe(400);
  });
});
