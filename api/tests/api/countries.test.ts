import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  countriesListResponseSchema,
  countryDetailResponseSchema,
  errorResponseSchema,
} from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

const validationErrorSchema = z.object({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    details: z.union([
      z.array(z.object({ path: z.string(), message: z.string() })),
      z.object({ from: z.string(), to: z.string() }),
    ]),
  }),
});

function firstPath(body: unknown): string | undefined {
  const { details } = validationErrorSchema.parse(body).error;
  return Array.isArray(details) ? details[0]?.path : undefined;
}

describe('GET /api/v1/countries', () => {
  it('lists the countries for the map (cases by default)', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries');

    expect(response.status).toBe(200);
    const body = countriesListResponseSchema.parse(response.body);
    expect(body.metric).toBe('cases');
    expect(body.date).toBe('2023-03-09');
    expect(body.countries.map((country) => country.code)).toEqual(['ARG', 'BRA', 'ESH']);
    expect(body.countries[2]).toMatchObject({ code: 'ESH', total: null, new: null });
  });

  it('uses the requested metric and ignores unknown parameters', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries?metric=deaths&foo=1');

    expect(response.status).toBe(200);
    expect(countriesListResponseSchema.parse(response.body).metric).toBe('deaths');
  });

  it('rejects an unknown metric', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries?metric=recovered');

    expect(response.status).toBe(400);
    expect(firstPath(response.body)).toBe('metric');
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/countries');

    expect(response.status).toBe(503);
  });
});

describe('GET /api/v1/countries/:code', () => {
  it('returns the detail with comparison, normalizing the code', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/bra');

    expect(response.status).toBe(200);
    const body = countryDetailResponseSchema.parse(response.body);
    expect(body.country.code).toBe('BRA');
    expect(body.comparison.cases).toEqual({ share: 40, rank: 2, rankedCount: 2 });
  });

  it('returns a null share when the global is 0', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/BRA?date=2023-03-08');

    expect(response.status).toBe(200);
    expect(countryDetailResponseSchema.parse(response.body).comparison.deaths.share).toBeNull();
  });

  it.each(['XYZ', 'XDP'])('responds 404 COUNTRY_NOT_FOUND for %s', async (code) => {
    const response = await request(createTestApp()).get(`/api/v1/countries/${code}`);

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body).error).toMatchObject({
      code: 'COUNTRY_NOT_FOUND',
      details: { code },
    });
  });

  it.each(['BR', 'BRAZ', 'B1A'])('responds 400 for code %s', async (code) => {
    const response = await request(createTestApp()).get(`/api/v1/countries/${code}`);

    expect(response.status).toBe(400);
    expect(firstPath(response.body)).toBe('code');
  });

  it('responds 400 for a date outside the coverage', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/BRA?date=2020-01-01');

    expect(response.status).toBe(400);
    expect(validationErrorSchema.parse(response.body).error.details).toEqual({
      from: '2023-03-08',
      to: '2023-03-09',
    });
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/countries/BRA');

    expect(response.status).toBe(503);
  });
});
