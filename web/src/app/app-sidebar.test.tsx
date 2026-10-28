import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldMapProps } from '../features/map/world-map';
import { renderWithProviders } from '../test/render';
import { App } from './app';

vi.mock('../features/map/world-map', () => ({
  WorldMap: ({ countries }: WorldMapProps) => (
    <div data-testid="world-map" data-count={countries?.length ?? 0} />
  ),
}));

describe('AppSidebar', () => {
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const originalWidth = window.innerWidth;

  afterEach(() => {
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('closes the mobile menu after navigating', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    window.matchMedia = (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
    renderWithProviders(<App />, { route: '/' });

    fireEvent.click(screen.getByRole('button', { name: 'Alternar menu lateral' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Sobre' }));

    expect(await screen.findByRole('heading', { name: 'Sobre os dados' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/sobre');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks Mapa as the current page on a country route', () => {
    renderWithProviders(<App />, { route: '/paises/BRA' });

    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Sobre' })).not.toHaveAttribute('aria-current');
  });

  it('keeps only the dashboard state in the Mapa link', () => {
    renderWithProviders(<App />, { route: '/paises/BRA?metric=deaths&period=7d&x=1' });

    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute(
      'href',
      '/?metric=deaths&period=7d',
    );
  });
});
