import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { seriesFallback } from './series-fallback';

const ready = { isPending: false, isError: false, error: null };

const notFound = {
  ...ready,
  isError: true,
  error: new ApiError(404, 'COUNTRY_NOT_FOUND', 'x', null),
};

function renderFallback(countryDetail?: typeof ready) {
  render(
    seriesFallback({
      meta: ready,
      onRetry: () => undefined,
      ready: true,
      series: [notFound],
      loadingLabel: 'Carregando',
      errorMessage: 'Erro',
      countryDetail,
    }),
  );
}

describe('seriesFallback', () => {
  it.each([
    ['answers COUNTRY_NOT_FOUND too', notFound],
    ['is still loading', { ...ready, isPending: true }],
  ])('keeps the skeleton for a 404 series while the detail %s', (_, detail) => {
    renderFallback(detail);

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByText('Sem dados no período')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [
      'failed with a server error',
      { ...ready, isError: true, error: new ApiError(500, 'INTERNAL_ERROR', 'x', null) },
    ],
    ['loaded', ready],
    ['is not given', undefined],
  ])('shows the error for a 404 series when the detail %s', (_, detail) => {
    renderFallback(detail);

    expect(screen.getByRole('alert')).toHaveTextContent('Erro');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
