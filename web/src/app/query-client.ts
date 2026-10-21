import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/client';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}
