import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../../src/openapi/document.js';
import { createTestApp } from '../helpers/test-app.js';

describe('API docs', () => {
  it('serves the OpenAPI JSON', async () => {
    const response = await request(createTestApp()).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(createOpenApiDocument())));
  });

  it('serves the Swagger UI with its own assets', async () => {
    const app = createTestApp();

    const redirect = await request(app).get('/api/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/api/docs/');

    const page = await request(app).get('/api/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui-init.js');

    expect((await request(app).get('/api/docs/swagger-ui-init.js')).status).toBe(200);
  });
});
