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

export interface CovidProvider {
  readonly sourceCode: string;
  readonly finalDate: string;
  fetchDay(date: string, metric: Metric): Promise<SourceRow[]>;
}
