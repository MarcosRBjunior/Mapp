import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { SiteFooter } from './site-footer';

const FALLBACK =
  'Fonte: COVID-19 Data Repository by CSSE at Johns Hopkins University (CC BY 4.0)';

describe('SiteFooter', () => {
  it('shows the source, its license and the map attributions', async () => {
    renderWithProviders(<SiteFooter />);

    expect(
      screen.getByText('Mapa: Natural Earth (domínio público) · Tiles: © Tiles de teste'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Fonte: API Ninjas (Termos de uso da API Ninjas) · Dados: API Ninjas (fonte original: JHU CSSE)',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument();
  });

  it('shows the fixed JHU source while /meta loads', () => {
    server.use(
      http.get(`${API}/api/v1/meta`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<SiteFooter />);

    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('keeps the fixed JHU source when /meta fails', async () => {
    server.use(http.get(`${API}/api/v1/meta`, () => new HttpResponse(null, { status: 500 })));
    const { queryClient } = renderWithProviders(<SiteFooter />);

    await waitFor(() => expect(queryClient.getQueryState(['meta'])?.status).toBe('error'));
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });
});
