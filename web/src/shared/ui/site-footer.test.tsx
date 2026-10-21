import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SiteFooter } from './site-footer';

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
  });
});
