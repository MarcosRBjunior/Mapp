import type { components } from './schema';

type Schemas = components['schemas'];

export type Metric = Schemas['Metric'];
export type MetaResponse = Schemas['MetaResponse'];
export type GlobalResponse = Schemas['GlobalResponse'];
export type CountriesListResponse = Schemas['CountriesListResponse'];
export type CountryListItem = CountriesListResponse['countries'][number];
export type CountryDetailResponse = Schemas['CountryDetailResponse'];
export type MetricValue = Schemas['MetricValue'];
export type ApiErrorCode = Schemas['ErrorResponse']['error']['code'];
export type GlobalTimeseriesResponse = Schemas['GlobalTimeseriesResponse'];
export type CountryTimeseriesResponse = Schemas['CountryTimeseriesResponse'];
export type TimeseriesPoint = Schemas['TimeseriesPoint'];
export type RankingsResponse = Schemas['RankingsResponse'];
export type RankingItem = RankingsResponse['items'][number];
