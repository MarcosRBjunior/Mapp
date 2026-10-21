// A test helper file: it exports a render function next to a private probe component.
/* eslint-disable react-refresh/only-export-components */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

interface RenderOptions {
  route?: string;
  path?: string | string[];
}

export function renderWithProviders(ui: ReactElement, { route = '/', path }: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const paths = path === undefined ? [] : Array.isArray(path) ? path : [path];
  const content =
    paths.length === 0 ? (
      ui
    ) : (
      <Routes>
        {paths.map((item) => (
          <Route key={item} path={item} element={ui} />
        ))}
      </Routes>
    );

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {content}
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
