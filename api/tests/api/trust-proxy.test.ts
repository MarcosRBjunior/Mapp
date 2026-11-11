import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

type App = ReturnType<typeof createTestApp>;

function get(app: App, ip: string) {
  return request(app).get('/api/unknown').set('X-Forwarded-For', ip);
}

async function exhaust(app: App, ip: string): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    await get(app, ip);
  }
}

describe('trust proxy', () => {
  it('counts the rate limit per X-Forwarded-For client behind one proxy', async () => {
    const app = createTestApp({ trustProxy: 1 });
    await exhaust(app, '203.0.113.1');

    expect((await get(app, '203.0.113.1')).status).toBe(429);
    expect((await get(app, '203.0.113.2')).status).toBe(404);
  });

  it('ignores X-Forwarded-For without a trusted proxy', async () => {
    const app = createTestApp();
    await exhaust(app, '203.0.113.1');

    expect((await get(app, '203.0.113.2')).status).toBe(429);
  });
});
