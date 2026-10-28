import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { DashboardControls } from './dashboard-controls';

describe('DashboardControls', () => {
  it('defaults to cases and 30 days', () => {
    renderWithProviders(<DashboardControls />, { route: '/' });

    expect(screen.getByRole('radiogroup', { name: 'Métrica' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Casos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('marks the metric and the period from the URL', () => {
    renderWithProviders(<DashboardControls />, { route: '/paises/BRA?metric=deaths&period=7d' });

    expect(screen.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes the metric to the URL', () => {
    renderWithProviders(<DashboardControls />, { route: '/paises/BRA' });

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
    expect(screen.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes the period to the URL and keeps the metric', () => {
    renderWithProviders(<DashboardControls />, { route: '/?metric=deaths' });

    fireEvent.click(screen.getByRole('radio', { name: '90 dias' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?metric=deaths&period=90d');
  });

  it('selects the next option with the arrow keys', async () => {
    renderWithProviders(<DashboardControls />, { route: '/' });
    const cases = screen.getByRole('radio', { name: 'Casos' });

    cases.focus();
    fireEvent.keyDown(cases, { key: 'ArrowRight' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/?metric=deaths'),
    );
  });

  it('ignores a click on the active option', () => {
    renderWithProviders(<DashboardControls />, { route: '/' });

    fireEvent.click(screen.getByRole('radio', { name: 'Casos' }));
    fireEvent.click(screen.getByRole('radio', { name: '30 dias' }));

    expect(screen.getByRole('radio', { name: 'Casos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('searches and opens a country keeping the query', async () => {
    renderWithProviders(<DashboardControls />, { route: '/?period=7d' });
    const input = screen.getByRole('combobox', { name: 'Buscar país' });
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: 'dinamarca' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/paises/DNK?period=7d'),
    );
  });
});
