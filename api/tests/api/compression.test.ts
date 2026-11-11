import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../../src/openapi/document.js';
import { createTestApp } from '../helpers/test-app.js';

// The OpenAPI JSON is large enough to compress; the fake data routes stay below the 1 kB threshold.
const LARGE_ROUTE = '/api/docs/openapi.json';

describe('response compression', () => {
  it('sends gzip when the client accepts it', async () => {
    const response = await request(createTestApp()).get(LARGE_ROUTE).set('Accept-Encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers.vary).toMatch(/Accept-Encoding/);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(createOpenApiDocument())));
  });

  it('prefers brotli when the client accepts it', async () => {
    const response = await request(createTestApp())
      .get(LARGE_ROUTE)
      .set('Accept-Encoding', 'br, gzip')
      .buffer(true)
      .parse((res, done) => {
        res.on('data', () => undefined);
        res.on('end', () => done(null, null));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('br');
  });

  it('sends the body as is when the client asks for no encoding', async () => {
    const response = await request(createTestApp())
      .get(LARGE_ROUTE)
      .set('Accept-Encoding', 'identity');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('leaves small responses uncompressed', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/global')
      .set('Accept-Encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('keeps the 304 for a matching dataVersion', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/countries')
      .set('Accept-Encoding', 'gzip')
      .set('If-None-Match', '"v7"');

    expect(response.status).toBe(304);
    expect(response.text).toBe('');
    expect(response.headers.etag).toBe('"v7"');
  });
});
