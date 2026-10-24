import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { parsePeriod, usePeriod } from './use-period';

function PeriodProbe() {
  const [period, setPeriod] = usePeriod();
  return (
    <button type="button" onClick={() => setPeriod('7d')}>
      {period}
    </button>
  );
}

describe('parsePeriod', () => {
  it('accepts the known periods and falls back to 30d', () => {
    expect(parsePeriod('7d')).toBe('7d');
    expect(parsePeriod('30d')).toBe('30d');
    expect(parsePeriod('90d')).toBe('90d');
    expect(parsePeriod('all')).toBe('all');
    expect(parsePeriod('15d')).toBe('30d');
    expect(parsePeriod(null)).toBe('30d');
  });
});

describe('usePeriod', () => {
  it('defaults to 30d without rewriting the URL', () => {
    renderWithProviders(<PeriodProbe />, { route: '/paises/BRA' });

    expect(screen.getByRole('button')).toHaveTextContent('30d');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA');
  });

  it('reads the period from the URL', () => {
    renderWithProviders(<PeriodProbe />, { route: '/?period=all' });

    expect(screen.getByRole('button')).toHaveTextContent('all');
  });

  it('changes only the period and keeps the path and other params', () => {
    renderWithProviders(<PeriodProbe />, { route: '/paises/BRA?metric=deaths' });

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('7d');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths&period=7d');
  });
});
