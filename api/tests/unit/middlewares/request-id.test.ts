import { describe, expect, it } from 'vitest';
import { resolveRequestId } from '../../../src/middlewares/request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reuses a safe incoming id', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
  });

  it.each([undefined, '', 'bad id!', 'x'.repeat(65), ['a', 'b']])(
    'generates a uuid for %s',
    (header) => {
      expect(resolveRequestId(header)).toMatch(UUID);
    },
  );
});
