import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CountrySearch } from '../features/search/country-search';
import { useCountries } from '../shared/api/queries';
import { MetricToggle } from '../shared/ui/metric-toggle';
import { PeriodToggle } from '../shared/ui/period-toggle';
import { useMetric } from '../shared/url/use-metric';
import { usePeriod } from '../shared/url/use-period';

export function DashboardControls() {
  const navigate = useNavigate();
  const location = useLocation();
  const [metric, setMetric] = useMetric();
  const [period, setPeriod] = usePeriod();
  const countries = useCountries(metric);

  const onSelect = useCallback(
    (code: string) => {
      void navigate({ pathname: `/paises/${code}`, search: location.search });
    },
    [navigate, location.search],
  );

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2 lg:gap-3">
      <CountrySearch
        countries={countries.data?.countries}
        isError={countries.isError}
        onSelect={onSelect}
      />
      <MetricToggle metric={metric} onChange={setMetric} />
      <PeriodToggle period={period} onChange={setPeriod} />
    </div>
  );
}
