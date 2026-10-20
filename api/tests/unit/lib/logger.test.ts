import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/lib/logger.js';

describe('createLogger', () => {
  it('redacts api keys wherever they appear', () => {
    const lines: string[] = [];
    const logger = createLogger('info', {
      write: (line: string) => {
        lines.push(line);
      },
    });
    logger.info(
      {
        apiKey: 'secret-1',
        provider: { apiKey: 'secret-2' },
        headers: { 'x-api-key': 'secret-3' },
        API_NINJAS_KEY: 'secret-4',
      },
      'call',
    );
    const output = lines.join('');
    expect(output).not.toMatch(/secret-/);
    expect(output).toContain('[Redacted]');
  });

  it('redacts the header casing the provider sends', () => {
    const lines: string[] = [];
    const logger = createLogger('info', {
      write: (line: string) => {
        lines.push(line);
      },
    });
    logger.info(
      {
        headers: { 'X-Api-Key': 'secret-5' },
        init: { headers: { 'X-Api-Key': 'secret-6' } },
      },
      'call',
    );
    expect(lines.join('')).not.toMatch(/secret-/);
  });

  it('redacts authorization and cookie headers of requests and responses', () => {
    const lines: string[] = [];
    const logger = createLogger('info', {
      write: (line: string) => {
        lines.push(line);
      },
    });
    logger.info(
      {
        req: { headers: { authorization: 'Bearer secret', cookie: 'sid=secret' } },
        res: { headers: { 'set-cookie': 'sid=secret' } },
      },
      'request',
    );
    const output = lines.join('');
    expect(output).not.toContain('secret');
    expect(output).toContain('[Redacted]');
  });
});
