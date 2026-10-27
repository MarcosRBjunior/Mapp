import { useCallback, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { CumulativeChart } from '../features/charts/cumulative-chart';
import { DailyNewChart } from '../features/charts/daily-new-chart';
import { CountryCard } from '../features/stats/country-card';
import { RankingTable } from '../features/ranking/ranking-table';
import { PeriodCard } from '../features/stats/period-card';
import { GlobalCard } from '../features/stats/global-card';
import { WorldMap } from '../features/map/world-map';
import { isApiError } from '../shared/api/client';
import { useCountries, useCountry } from '../shared/api/queries';
import { useMetric } from '../shared/url/use-metric';
import { selectionKeyOf, selectionState } from '../shared/url/selection';
import { usePeriod } from '../shared/url/use-period';

const CODE_PATTERN = /^[A-Za-z]{3}$/;

export function DashboardPage() {
  const { code: rawCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [metric] = useMetric();
  const [period] = usePeriod();

  const validCode =
    rawCode !== undefined && CODE_PATTERN.test(rawCode) ? rawCode.toUpperCase() : null;
  const countries = useCountries(metric);
  const country = useCountry(validCode);
  const notFound =
    rawCode !== undefined && (validCode === null || isApiError(country.error, 'COUNTRY_NOT_FOUND'));
  const selectedCode = notFound ? null : validCode;
  const countryName = selectedCode !== null ? country.data?.country.name : undefined;

  useEffect(() => {
    document.title = countryName ? `${countryName} — Mapp` : 'Mapp — COVID-19';
  }, [countryName]);

  const onSelect = useCallback(
    (code: string) => {
      void navigate(
        { pathname: `/paises/${code}`, search: location.search },
        { state: selectionState() },
      );
    },
    [navigate, location.search],
  );

  // The map has seen the selection key by now (child effects run first): drop it from the entry,
  // so Back/Forward never carries a pending popup reopen.
  const hasSelectionState = selectionKeyOf(location.state) !== '';
  useEffect(() => {
    if (!hasSelectionState) return;
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [hasSelectionState, location.key, location.pathname, location.search, navigate]);

  if (rawCode !== undefined && validCode !== null && rawCode !== validCode) {
    return <Navigate to={{ pathname: `/paises/${validCode}`, search: location.search }} replace />;
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      {notFound && (
        <div className="px-4 lg:px-6">
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
            role="alert"
          >
            <p>{`País não encontrado: ${rawCode}`}</p>
            <Link
              className="font-medium underline underline-offset-4"
              to={{ pathname: '/', search: location.search }}
            >
              Voltar à visão mundial
            </Link>
          </div>
        </div>
      )}
      <div className="px-4 lg:px-6">
        <WorldMap
          metric={metric}
          countries={countries.data?.countries}
          countriesStatus={countries.status}
          onRetry={() => void countries.refetch()}
          referenceDate={countries.data?.date}
          selectedCode={selectedCode}
          selectionKey={selectionKeyOf(location.state)}
          onSelect={onSelect}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        <GlobalCard />
        <CountryCard code={selectedCode} metric={metric} />
        <PeriodCard code={selectedCode} metric={metric} period={period} />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @5xl/main:grid-cols-2">
        <CumulativeChart code={selectedCode} metric={metric} period={period} />
        <DailyNewChart code={selectedCode} metric={metric} period={period} />
      </div>
      <div className="px-4 lg:px-6">
        <RankingTable metric={metric} selectedCode={selectedCode} />
      </div>
    </div>
  );
}
