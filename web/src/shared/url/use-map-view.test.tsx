import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { parseMapView, useMapView } from './use-map-view';

function ViewProbe() {
  const [view, setView] = useMapView();
  return (
    <button type="button" onClick={() => setView(view === 'markers' ? 'choropleth' : 'markers')}>
      {view}
    </button>
  );
}

describe('parseMapView', () => {
  it('accepts choropleth and falls back to markers', () => {
    expect(parseMapView('choropleth')).toBe('choropleth');
    expect(parseMapView('markers')).toBe('markers');
    expect(parseMapView('x')).toBe('markers');
    expect(parseMapView(null)).toBe('markers');
  });
});

describe('useMapView', () => {
  it('switches the view in the URL without a history step', () => {
    renderWithProviders(<ViewProbe />, { route: '/paises/BRA?metric=deaths' });

    fireEvent.click(screen.getByRole('button', { name: 'markers' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/paises/BRA?metric=deaths&view=choropleth',
    );
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');

    fireEvent.click(screen.getByRole('button', { name: 'choropleth' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
  });
});
