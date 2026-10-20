import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { FAKE_DATA_VERSION, FAKE_REFERENCE } from '../helpers/fake-repositories.js';
import { createTestApp, TEST_WEB_ORIGIN } from '../helpers/test-app.js';

interface ErrorBody {
  error: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('GET /health', () => {
  it('responds 200 with status ok', async () => {
    const response = await request(createTestApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('responds 200 with dataVersion and reference date', async () => {
    const response = await request(createTestApp()).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      dataVersion: FAKE_DATA_VERSION,
      referenceDate: FAKE_REFERENCE,
    });
  });

  it('responds 503 DATA_NOT_READY without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/ready');

    expect(response.status).toBe(503);
    expect((response.body as ErrorBody).error).toMatchObject({
      code: 'DATA_NOT_READY',
      message: 'no data has been loaded yet',
      details: null,
    });
  });

  it('responds 503 DATA_NOT_READY when the database fails', async () => {
    const response = await request(createTestApp({ failing: true })).get('/ready');

    expect(response.status).toBe(503);
    expect((response.body as ErrorBody).error).toMatchObject({
      code: 'DATA_NOT_READY',
      message: 'data is not available',
    });
  });
});

describe('errors and middlewares', () => {
  it('answers an unknown route with NOT_FOUND and the request id', async () => {
    const response = await request(createTestApp()).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'route not found',
        details: null,
        requestId: response.headers['x-request-id'],
      },
    });
    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('reuses a safe X-Request-Id and replaces an unsafe one', async () => {
    const app = createTestApp();

    const reused = await request(app).get('/health').set('X-Request-Id', 'abc-123');
    expect(reused.headers['x-request-id']).toBe('abc-123');

    const replaced = await request(app).get('/health').set('X-Request-Id', 'bad id!');
    expect(replaced.headers['x-request-id']).toMatch(UUID);
  });

  it('allows CORS only for WEB_ORIGIN', async () => {
    const app = createTestApp();

    const allowed = await request(app).get('/health').set('Origin', TEST_WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_WEB_ORIGIN);

    // cors with a fixed origin always answers with WEB_ORIGIN; the browser rejects a mismatch.
    const other = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBe(TEST_WEB_ORIGIN);
  });

  it('sets helmet headers and hides x-powered-by', async () => {
    const response = await request(createTestApp()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rate limits /api at 120 requests per minute, but not /health', async () => {
    const app = createTestApp();

    for (let i = 0; i < 120; i += 1) {
      const response = await request(app).get('/api/unknown');
      expect(response.status).toBe(404);
    }
    const limited = await request(app).get('/api/unknown');
    expect(limited.status).toBe(429);
    expect((limited.body as ErrorBody).error).toMatchObject({
      code: 'RATE_LIMITED',
      details: null,
    });

    expect((await request(app).get('/health')).status).toBe(200);
  });
});
