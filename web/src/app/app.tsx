import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { NotFoundPage } from '../pages/not-found-page';
import { Skeleton } from '../shared/ui/skeleton';
import { Layout } from './layout';

// Leaflet and Recharts only download on the pages that use them.
const DashboardPage = lazy(() =>
  import('../pages/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);
const AboutPage = lazy(() =>
  import('../pages/about-page').then((module) => ({ default: module.AboutPage })),
);

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-4 lg:p-6">
          <Skeleton label="Carregando a página" height="60vh" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Page>
              <DashboardPage />
            </Page>
          }
        />
        <Route
          path="paises/:code"
          element={
            <Page>
              <DashboardPage />
            </Page>
          }
        />
        <Route
          path="sobre"
          element={
            <Page>
              <AboutPage />
            </Page>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
