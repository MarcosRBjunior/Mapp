import { describe, expect, it } from 'vitest';
import { aggregateDay, type AliasEntry } from '../../../../src/jobs/sync/aggregate.js';
import { fixtureDayRows } from '../../../helpers/api-ninjas-fixtures.js';

const mapped = (countryCode: string): AliasEntry => ({ status: 'mapped', countryCode });

const ALIASES = new Map<string, AliasEntry>([
  ['Australia', mapped('AUS')],
  ['Brazil', mapped('BRA')],
  ['Denmark', mapped('DNK')],
  ['Diamond Princess', mapped('XDP')],
]);

describe('aggregateDay', () => {
  it('sums the regions of each country for cases (RN-02)', () => {
    expect(aggregateDay(fixtureDayRows('cases'), ALIASES)).toEqual({
      stats: [
        { countryCode: 'AUS', total: 11399460, new: 13926 },
        { countryCode: 'BRA', total: 37076053, new: 0 },
        { countryCode: 'DNK', total: 3451036, new: 139 },
        { countryCode: 'XDP', total: 712, new: 0 },
      ],
      pendingNames: [],
      ignoredNames: [],
    });
  });

  it('sums the regions of each country for deaths (RN-02)', () => {
    expect(aggregateDay(fixtureDayRows('deaths'), ALIASES).stats).toEqual([
      { countryCode: 'AUS', total: 19574, new: 115 },
      { countryCode: 'BRA', total: 699276, new: 0 },
      { countryCode: 'DNK', total: 8345, new: 4 },
      { countryCode: 'XDP', total: 13, new: 0 },
    ]);
  });

  it('lists an unknown name once and leaves it out of the stats', () => {
    const rows = [
      ...fixtureDayRows('cases'),
      { country: 'Atlantis', region: 'North', total: 5, new: 1 },
      { country: 'Atlantis', region: 'South', total: 3, new: 0 },
    ];
    const day = aggregateDay(rows, ALIASES);
    expect(day.pendingNames).toEqual(['Atlantis']);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'BRA', 'DNK', 'XDP']);
  });

  it('treats a pending alias as unmapped', () => {
    const aliases = new Map(ALIASES).set('Brazil', { status: 'pending', countryCode: null });
    const day = aggregateDay(fixtureDayRows('cases'), aliases);
    expect(day.pendingNames).toEqual(['Brazil']);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'DNK', 'XDP']);
  });

  it('skips ignored names', () => {
    const aliases = new Map(ALIASES).set('Diamond Princess', {
      status: 'ignored',
      countryCode: null,
    });
    const day = aggregateDay(fixtureDayRows('cases'), aliases);
    expect(day.ignoredNames).toEqual(['Diamond Princess']);
    expect(day.pendingNames).toEqual([]);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'BRA', 'DNK']);
  });

  it('keeps negative new values when summing (RN-07)', () => {
    const day = aggregateDay(
      [
        { country: 'Brazil', region: 'A', total: 10, new: -5 },
        { country: 'Brazil', region: 'B', total: 4, new: 2 },
      ],
      ALIASES,
    );
    expect(day.stats).toEqual([{ countryCode: 'BRA', total: 14, new: -3 }]);
  });
});
