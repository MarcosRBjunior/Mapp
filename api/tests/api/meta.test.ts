import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { metaResponseSchema } from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/meta', () => {
  it('describes the data', async () => {
    const response = await request(createTestApp()).get('/api/v1/meta');

    expect(response.status).toBe(200);
    const body = metaResponseSchema.parse(response.body);
    expect(body).toMatchObject({
      coverage: { from: '2023-03-08', to: '2023-03-09', countries: 3 },
      referenceDate: '2023-03-09',
      dataVersion: 7,
      lastSync: { status: 'partial', mode: 'snapshot' },
    });
  });

  it('responds 200 with nulls when no data is loaded', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/meta');

    expect(response.status).toBe(200);
    expect(metaResponseSchema.parse(response.body)).toMatchObject({
      coverage: null,
      referenceDate: null,
      dataVersion: null,
      lastSync: null,
    });
  });
});
