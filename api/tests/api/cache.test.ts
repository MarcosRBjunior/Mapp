import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

const DATA_ROUTES = [
  '/api/v1/global',
  '/api/v1/global/timeseries',
  '/api/v1/countries',
  '/api/v1/countries/BRA',
  '/api/v1/countries/BRA/timeseries',
  '/api/v1/rankings',
];

describe('cache by dataVersion', () => {
  it.each(DATA_ROUTES)('%s sends Cache-Control and the dataVersion ETag', async (route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(response.headers.etag).toBe('"v7"');
  });

  it.each(DATA_ROUTES)('%s answers 304 when If-None-Match matches', async (route) => {
    const response = await request(createTestApp()).get(route).set('If-None-Match', '"v7"');

    expect(response.status).toBe(304);
    expect(response.text).toBe('');
    expect(response.headers.etag).toBe('"v7"');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('answers 200 for an older version', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/global')
      .set('If-None-Match', '"v6"');

    expect(response.status).toBe(200);
  });

  it('answers 304 before validating the query', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/global?date=yesterday')
      .set('If-None-Match', '"v7"');

    expect(response.status).toBe(304);
  });

  it.each([
    ['400', '/api/v1/global?date=2023-03-10'],
    ['404 country', '/api/v1/countries/XYZ'],
    ['404 route', '/api/v1/nope'],
  ])('a %s is no-store without ETag', async (_label, route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });

  it('a 503 is no-store without ETag', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/global');

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });

  it.each(['/health', '/ready'])('%s is no-store', async (route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('/meta ETag', () => {
  it('includes the last finished run', async () => {
    const response = await request(createTestApp()).get('/api/v1/meta');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"v7.r9"');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('answers 304 when it matches', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/meta')
      .set('If-None-Match', '"v7.r9"');

    expect(response.status).toBe(304);
  });

  it('works without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/meta');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"v0.r0"');
  });
});
