import { useCallback, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { CountryCard } from '../features/stats/country-card';
import { GlobalCard } from '../features/stats/global-card';
import { WorldMap } from '../features/map/world-map';
import { isApiError } from '../shared/api/client';
import { useCountries, useCountry } from '../shared/api/queries';
import { useMetric } from '../shared/url/use-metric';

const CODE_PATTERN = /^[A-Za-z]{3}$/;

export function DashboardPage() {
  const { code: rawCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [metric] = useMetric();

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
      void navigate({ pathname: `/paises/${code}`, search: location.search });
    },
    [navigate, location.search],
  );

  if (rawCode !== undefined && validCode !== null && rawCode !== validCode) {
    return <Navigate to={{ pathname: `/paises/${validCode}`, search: location.search }} replace />;
  }

  return (
    <div className="dashboard">
      {notFound && (
        <div className="notice" role="alert">
          <p>{`País não encontrado: ${rawCode}`}</p>
          <Link to={{ pathname: '/', search: location.search }}>Voltar à visão mundial</Link>
        </div>
      )}
      <WorldMap
        metric={metric}
        countries={countries.data?.countries}
        countriesStatus={countries.status}
        onRetry={() => void countries.refetch()}
        referenceDate={countries.data?.date}
        selectedCode={selectedCode}
        onSelect={onSelect}
      />
      <div className="cards">
        <GlobalCard />
        <CountryCard code={selectedCode} metric={metric} />
      </div>
    </div>
  );
}
