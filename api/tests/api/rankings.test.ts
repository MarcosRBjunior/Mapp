import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema, rankingsResponseSchema } from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/rankings', () => {
  it('ranks cases on the reference date, ties in alphabetical order', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings');

    expect(response.status).toBe(200);
    expect(rankingsResponseSchema.parse(response.body)).toEqual({
      date: '2023-03-09',
      metric: 'cases',
      rankedCount: 2,
      items: [
        { rank: 1, code: 'ARG', name: 'Argentina', total: 100, new: 5, share: 40 },
        { rank: 2, code: 'BRA', name: 'Brasil', total: 100, new: 10, share: 40 },
      ],
    });
  });

  it('uses the metric and the limit', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings?metric=deaths&limit=1');

    expect(response.status).toBe(200);
    expect(rankingsResponseSchema.parse(response.body)).toMatchObject({
      metric: 'deaths',
      rankedCount: 2,
      items: [{ rank: 1, code: 'ARG', total: 20, share: 57.1 }],
    });
  });

  it.each(['0', '51', '1.5', 'abc'])('rejects limit=%s', async (limit) => {
    const response = await request(createTestApp()).get(`/api/v1/rankings?limit=${limit}`);

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a date outside the coverage', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings?date=2023-03-10');

    expect(response.status).toBe(400);
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/rankings');

    expect(response.status).toBe(503);
  });
});
