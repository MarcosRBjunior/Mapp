import { describe, expect, it } from 'vitest';
import { ApiError } from '../shared/api/client';
import { createQueryClient, shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('never retries a 4xx', () => {
    expect(shouldRetry(0, new ApiError(404, 'COUNTRY_NOT_FOUND', 'x', null))).toBe(false);
    expect(shouldRetry(0, new ApiError(429, 'RATE_LIMITED', 'x', null))).toBe(false);
  });

  it('retries a 5xx or network error once', () => {
    expect(shouldRetry(0, new ApiError(500, 'INTERNAL_ERROR', 'x', null))).toBe(true);
    expect(shouldRetry(0, new ApiError(0, 'NETWORK_ERROR', 'x', null))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, 'DATA_NOT_READY', 'x', null))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('keeps data fresh for 5 minutes', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.staleTime).toBe(5 * 60 * 1000);
  });
});
