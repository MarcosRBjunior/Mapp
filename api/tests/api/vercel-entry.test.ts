import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Vercel function entry', () => {
  it('exports the app built from the environment', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://reader:secret@127.0.0.1:5435/mapp');
    vi.stubEnv('WEB_ORIGIN', 'https://mapp.example.app');
    vi.stubEnv('LOG_LEVEL', 'silent');

    const { default: app } = await import('../../api/index.js');
    const response = await request(app).get('/health').set('Origin', 'https://mapp.example.app');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe('https://mapp.example.app');
  });

  it('fails to load with an invalid environment', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('WEB_ORIGIN', 'https://mapp.example.app');

    await expect(import('../../api/index.js')).rejects.toThrow(/Invalid environment variables/);
  });
});
