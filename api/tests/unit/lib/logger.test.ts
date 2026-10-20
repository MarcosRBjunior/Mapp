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
});
