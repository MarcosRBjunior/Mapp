import { describe, expect, it } from 'vitest';
import {
  CUMULATIVE_LABELS,
  METRIC_LABELS,
  NEW_LABELS,
  formatCompact,
  formatDate,
  formatNumber,
  formatPercent,
  formatRank,
} from './format';

describe('format', () => {
  it('formats numbers in pt-BR and null as a dash', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(-5)).toBe('-5');
    expect(formatNumber(null)).toBe('—');
  });

  it('formats percentages with one decimal', () => {
    expect(formatPercent(12.3)).toBe('12,3%');
    expect(formatPercent(30)).toBe('30,0%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats an ISO date without shifting the day', () => {
    expect(formatDate('2023-03-09')).toBe('09/03/2023');
    expect(formatDate('2020-01-01')).toBe('01/01/2020');
    expect(formatDate('ontem')).toBe('ontem');
  });

  it('formats a rank', () => {
    expect(formatRank(3, 196)).toBe('nº 3 de 196');
    expect(formatRank(null, 196)).toBe('—');
  });

  it('labels the metrics', () => {
    expect(METRIC_LABELS.cases).toEqual({ title: 'Casos', noun: 'casos' });
    expect(METRIC_LABELS.deaths).toEqual({ title: 'Mortes', noun: 'mortes' });
  });
});

describe('chart labels and compact numbers', () => {
  it('names the new and cumulative values of each metric', () => {
    expect(NEW_LABELS).toEqual({ cases: 'Novos casos', deaths: 'Novas mortes' });
    expect(CUMULATIVE_LABELS).toEqual({ cases: 'Casos acumulados', deaths: 'Mortes acumuladas' });
  });

  it('formats axis numbers in compact pt-BR', () => {
    // Intl puts a no-break space before the unit.
    expect(formatCompact(1371600).replace(/\s/g, ' ')).toBe('1,4 mi');
    expect(formatCompact(950)).toBe('950');
  });
});
