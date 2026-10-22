import { describe, expect, it } from 'vitest';
import { aggregateSeries, type AliasEntry } from '../../../../src/jobs/sync/aggregate.js';

const aliases = new Map<string, AliasEntry>([
  ['Australia', { status: 'mapped', countryCode: 'AUS' }],
  ['Brazil', { status: 'mapped', countryCode: 'BRA' }],
  ['Summer Olympics 2020', { status: 'ignored', countryCode: null }],
]);

describe('aggregateSeries', () => {
  it('sums the regions of a country per date (RN-02)', () => {
    const result = aggregateSeries(
      [
        {
          country: 'Australia',
          region: 'New South Wales',
          points: [
            { date: '2023-03-08', total: 100, new: 5 },
            { date: '2023-03-09', total: 110, new: 10 },
          ],
        },
        {
          country: 'Australia',
          region: 'Victoria',
          points: [{ date: '2023-03-09', total: 50, new: 2 }],
        },
      ],
      aliases,
    );

    expect(result).toEqual({
      series: [
        {
          countryCode: 'AUS',
          points: [
            { date: '2023-03-08', total: 100, new: 5 },
            { date: '2023-03-09', total: 160, new: 12 },
          ],
        },
      ],
      pendingNames: [],
      ignoredNames: [],
    });
  });

  it('keeps a negative new as it came (RN-07)', () => {
    const result = aggregateSeries(
      [{ country: 'Brazil', region: '', points: [{ date: '2023-03-06', total: 995, new: -5 }] }],
      aliases,
    );
    expect(result.series[0]?.points).toEqual([{ date: '2023-03-06', total: 995, new: -5 }]);
  });

  it('reports pending and ignored names without counting them', () => {
    const result = aggregateSeries(
      [
        { country: 'Atlantis', region: '', points: [{ date: '2023-03-09', total: 1, new: 0 }] },
        { country: 'Summer Olympics 2020', region: '', points: [] },
      ],
      aliases,
    );
    expect(result).toEqual({
      series: [],
      pendingNames: ['Atlantis'],
      ignoredNames: ['Summer Olympics 2020'],
    });
  });

  it('returns one entry per country code, ordered by code', () => {
    const result = aggregateSeries(
      [
        { country: 'Brazil', region: '', points: [{ date: '2023-03-09', total: 1, new: 0 }] },
        { country: 'Australia', region: '', points: [{ date: '2023-03-09', total: 2, new: 0 }] },
      ],
      aliases,
    );
    expect(result.series.map((entry) => entry.countryCode)).toEqual(['AUS', 'BRA']);
  });
});
