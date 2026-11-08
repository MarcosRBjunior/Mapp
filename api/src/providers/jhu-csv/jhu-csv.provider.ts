import type {
  CovidProvider,
  FetchLike,
  Metric,
  ProviderFactory,
  SeriesRow,
} from '../covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
  isTimeoutError,
} from '../provider-errors.js';
import { JHU_CSV_FINAL_DATE, JHU_CSV_FIRST_DATE, parseTimeSeries } from './jhu-csv.parse.js';

export { JHU_CSV_FINAL_DATE, JHU_CSV_FIRST_DATE } from './jhu-csv.parse.js';

// COVID-19 Data Repository by JHU CSSE (CC BY 4.0); collection ended on 2023-03-10.
export const JHU_CSV_BASE_URL =
  'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series';

export const JHU_CSV_FILES: Record<Metric, string> = {
  cases: 'time_series_covid19_confirmed_global.csv',
  deaths: 'time_series_covid19_deaths_global.csv',
};

const DAY_MS = 86_400_000;

async function download(fetch: FetchLike, metric: Metric): Promise<SeriesRow[]> {
  const response = await fetch(`${JHU_CSV_BASE_URL}/${JHU_CSV_FILES[metric]}`, { headers: {} });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(response.status);
  }
  if (!response.ok) {
    throw new ProviderHttpError(response.status);
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ProviderNetworkError(isTimeoutError(error) ? 'timeout' : 'network_error', {
      cause: error,
    });
  }
  return parseTimeSeries(text);
}

// Each file holds the whole series of every country, so a run downloads it once per metric:
// a snapshot or a full run costs two calls. A failed download is retried by the next unit,
// except an invalid file, which would fail the same way again.
export function createJhuCsvProvider(options: { fetch: FetchLike }): CovidProvider {
  const tables = new Map<Metric, Promise<SeriesRow[]>>();

  function table(metric: Metric): Promise<SeriesRow[]> {
    const cached = tables.get(metric);
    if (cached) return cached;
    const pending = download(options.fetch, metric);
    tables.set(metric, pending);
    pending.catch((error: unknown) => {
      if (!(error instanceof ProviderPayloadError)) tables.delete(metric);
    });
    return pending;
  }

  return {
    async fetchDay(date, metric) {
      const day = Math.round(
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${JHU_CSV_FIRST_DATE}T00:00:00Z`)) / DAY_MS,
      );
      const rows = await table(metric);
      return rows.map((row) => {
        const point = row.points[day];
        if (point?.date !== date) {
          throw new ProviderPayloadError(`the series has no column for ${date}`);
        }
        return { country: row.country, region: row.region, total: point.total, new: point.new };
      });
    },
    async fetchSeries(sourceName, metric) {
      return (await table(metric)).filter((row) => row.country === sourceName);
    },
  };
}

export function jhuCsvFactory(): ProviderFactory {
  return {
    sourceCode: 'jhu_csv',
    finalDate: JHU_CSV_FINAL_DATE,
    create: (fetch) => createJhuCsvProvider({ fetch }),
  };
}
