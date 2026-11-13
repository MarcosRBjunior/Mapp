import type { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

// Waits until nothing is fetching and `errors` queries failed, then lets TanStack Query deliver
// that state to the components: its notify batch runs on a zero-delay timer, queued before ours.
export async function waitForFailedQueries(queryClient: QueryClient, errors: number) {
  await waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ type: 'all' })
        .filter((query) => query.state.status === 'error'),
    ).toHaveLength(errors);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
