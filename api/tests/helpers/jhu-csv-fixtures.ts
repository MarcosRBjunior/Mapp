import { readFileSync } from 'node:fs';
import type { Metric } from '../../src/providers/covid-provider.js';
import { JHU_CSV_FILES } from '../../src/providers/jhu-csv/jhu-csv.provider.js';

// Real rows cropped from the JHU CSSE files (CC BY 4.0, see fixtures/jhu-csv/README.md).
export function jhuFixtureText(metric: Metric): string {
  const file = JHU_CSV_FILES[metric].replace(/\.csv$/, '.sample.csv');
  return readFileSync(new URL(`../fixtures/jhu-csv/${file}`, import.meta.url), 'utf8');
}

const DAY_MS = 86_400_000;
const FIRST = Date.UTC(2020, 0, 22);

// M/D/YY labels from 2020-01-22 for `days` consecutive days (1143 days reach 2023-03-09).
export function jhuDateLabels(days = 1143): string[] {
  return Array.from({ length: days }, (_, day) => {
    const date = new Date(FIRST + day * DAY_MS);
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${String(date.getUTCFullYear()).slice(2)}`;
  });
}

export interface SyntheticRow {
  region?: string;
  country: string;
  total: (day: number) => number;
}

function quote(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// An invented file in the JHU layout: one column per day and the totals given per row.
export function syntheticJhuCsv(rows: SyntheticRow[], labels = jhuDateLabels()): string {
  const header = ['Province/State', 'Country/Region', 'Lat', 'Long', ...labels].join(',');
  const lines = rows.map((row) =>
    [
      quote(row.region ?? ''),
      quote(row.country),
      '0',
      '0',
      ...labels.map((_, day) => String(row.total(day))),
    ].join(','),
  );
  return `${[header, ...lines].join('\n')}\n`;
}
