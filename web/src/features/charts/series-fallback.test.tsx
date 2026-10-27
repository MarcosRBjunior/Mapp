import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { seriesFallback } from './series-fallback';

const ready = { isPending: false, isError: false, error: null, refetch: () => Promise.resolve() };

describe('seriesFallback', () => {
  it('keeps the skeleton for COUNTRY_NOT_FOUND, the page swaps in the world view', () => {
    const failed = {
      ...ready,
      isError: true,
      error: new ApiError(404, 'COUNTRY_NOT_FOUND', 'x', null),
    };
    render(
      seriesFallback({
        meta: ready,
        ready: true,
        series: [failed],
        loadingLabel: 'Carregando',
        errorMessage: 'Erro',
      }),
    );

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByText('Sem dados no período')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
