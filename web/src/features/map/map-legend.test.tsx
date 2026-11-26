import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { countriesFixture } from '../../test/fixtures';
import { MapLegend } from './map-legend';

describe('MapLegend', () => {
  const { countries } = countriesFixture('cases');

  it('lists the five classes and the no-data fill in the choropleth', () => {
    render(<MapLegend countries={countries} metric="cases" view="choropleth" />);

    const legend = screen.getByRole('group', { name: 'Legenda: Total de casos' });
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent(/^menos de/);
    expect(items[4]).toHaveTextContent(/ou mais$/);
    expect(items[5]).toHaveTextContent('Sem dados');
  });

  it('shows the marker sizes in the markers view', () => {
    render(<MapLegend countries={countries} metric="cases" view="markers" />);

    const legend = screen.getByRole('group', { name: 'Legenda: Total de casos' });
    expect(within(legend).queryByText('Sem dados')).not.toBeInTheDocument();
    expect(legend.querySelectorAll('circle').length).toBeGreaterThan(0);
  });
});
