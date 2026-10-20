import { readFileSync } from 'node:fs';
import { daySchemas } from '../../src/providers/api-ninjas/api-ninjas.schemas.js';
import type { Metric, SourceRow } from '../../src/providers/covid-provider.js';

export function fixtureText(name: string): string {
  return readFileSync(new URL(`../fixtures/api-ninjas/${name}`, import.meta.url), 'utf8');
}

export function fixtureDayRows(metric: Metric): SourceRow[] {
  return daySchemas[metric].parse(JSON.parse(fixtureText(`date-2023-03-09-${metric}.json`)));
}
