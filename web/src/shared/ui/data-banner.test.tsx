import { fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { metaFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { DataBanner } from './data-banner';

describe('DataBanner', () => {
  it('shows the reference date and the source', async () => {
    renderWithProviders(<DataBanner />);

    expect(
      await screen.findByText('Dados históricos até 09/03/2023 · Fonte: API Ninjas'),
    ).toBeInTheDocument();
  });

  it('says when no data was loaded yet', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({
          ...metaFixture,
          referenceDate: null,
          coverage: null,
          dataVersion: null,
        }),
      ),
    );
    renderWithProviders(<DataBanner />);

    expect(
      await screen.findByText('Dados ainda não carregados · Fonte: API Ninjas'),
    ).toBeInTheDocument();
  });

  it('shows a local error that can be retried', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<DataBanner />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a data de referência',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText(/Dados históricos até 09\/03\/2023/)).toBeInTheDocument();
  });
});
