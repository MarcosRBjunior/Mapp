import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { parseMetric, useMetric } from './use-metric';

function MetricProbe() {
  const [metric, setMetric] = useMetric();
  return (
    <button type="button" onClick={() => setMetric('deaths')}>
      {metric}
    </button>
  );
}

describe('parseMetric', () => {
  it('accepts deaths and falls back to cases', () => {
    expect(parseMetric('deaths')).toBe('deaths');
    expect(parseMetric('cases')).toBe('cases');
    expect(parseMetric('foo')).toBe('cases');
    expect(parseMetric(null)).toBe('cases');
  });
});

describe('useMetric', () => {
  it('defaults to cases without rewriting the URL', () => {
    renderWithProviders(<MetricProbe />, { route: '/paises/BRA' });

    expect(screen.getByRole('button')).toHaveTextContent('cases');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA');
  });

  it('treats an invalid value as cases', () => {
    renderWithProviders(<MetricProbe />, { route: '/?metric=foo' });

    expect(screen.getByRole('button')).toHaveTextContent('cases');
  });

  it('reads deaths from the URL', () => {
    renderWithProviders(<MetricProbe />, { route: '/?metric=deaths' });

    expect(screen.getByRole('button')).toHaveTextContent('deaths');
  });

  it('changes only the metric and keeps the path and other params', () => {
    renderWithProviders(<MetricProbe />, { route: '/paises/BRA?x=1' });

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('deaths');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?x=1&metric=deaths');
  });

  it('replaces the history entry instead of pushing a new one', () => {
    renderWithProviders(<MetricProbe />, { route: '/paises/BRA' });
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP');

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
  });
});
