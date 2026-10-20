import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorResponseSchema, globalResponseSchema } from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

const validationErrorSchema = z.object({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    details: z.array(z.object({ path: z.string(), message: z.string() })),
  }),
});

describe('GET /api/v1/global', () => {
  it('returns the reference date by default', async () => {
    const response = await request(createTestApp()).get('/api/v1/global');

    expect(response.status).toBe(200);
    expect(globalResponseSchema.parse(response.body)).toEqual({
      date: '2023-03-09',
      cases: { total: 250, new: 15 },
      deaths: { total: 35, new: 3 },
      countryCount: 3,
    });
  });

  it('returns a requested date', async () => {
    const response = await request(createTestApp()).get('/api/v1/global?date=2023-03-08');

    expect(response.status).toBe(200);
    expect(globalResponseSchema.parse(response.body).date).toBe('2023-03-08');
  });

  it('rejects a date outside the coverage with the valid range', async () => {
    const response = await request(createTestApp()).get('/api/v1/global?date=2023-03-10');

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'date is outside the data coverage',
      details: { from: '2023-03-08', to: '2023-03-09' },
    });
  });

  it.each(['2023-02-30', '2023-3-9', 'yesterday'])('rejects date=%s', async (date) => {
    const response = await request(createTestApp()).get(`/api/v1/global?date=${date}`);

    expect(response.status).toBe(400);
    const { error } = validationErrorSchema.parse(response.body);
    expect(error.details[0]?.path).toBe('date');
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/global');

    expect(response.status).toBe(503);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('DATA_NOT_READY');
  });
});
