import { describe, expect, it } from 'vitest';

describe('test network guard', () => {
  it('blocks the global fetch', async () => {
    await expect(fetch('https://example.com')).rejects.toThrow(/Network is blocked in tests/);
  });
});
