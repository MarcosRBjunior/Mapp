import { describe, expect, it } from 'vitest';
import { dashboardSearch } from './dashboard-search';

describe('dashboardSearch', () => {
  it('keeps only metric, period and view, in that order', () => {
    expect(dashboardSearch('?view=choropleth&period=7d&metric=deaths&x=1')).toBe(
      '?metric=deaths&period=7d&view=choropleth',
    );
  });

  it('returns an empty string without dashboard params', () => {
    expect(dashboardSearch('?x=1')).toBe('');
    expect(dashboardSearch('')).toBe('');
  });
});
