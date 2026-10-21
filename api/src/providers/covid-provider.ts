export type Metric = 'cases' | 'deaths';

export interface SourceRow {
  country: string;
  region: string;
  total: number;
  new: number;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

export const METRICS: readonly Metric[] = ['cases', 'deaths'];

export interface SeriesPoint {
  date: string;
  total: number;
  new: number;
}

export interface SeriesRow {
  country: string;
  region: string;
  points: SeriesPoint[];
}

export interface CovidProvider {
  readonly sourceCode: string;
  readonly finalDate: string;
  fetchDay(date: string, metric: Metric): Promise<SourceRow[]>;
  fetchSeries(sourceName: string, metric: Metric): Promise<SeriesRow[]>;
}
