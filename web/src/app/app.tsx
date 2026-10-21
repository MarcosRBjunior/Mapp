import { Route, Routes } from 'react-router';
import { AboutPage } from '../pages/about-page';
import { DashboardPage } from '../pages/dashboard-page';
import { NotFoundPage } from '../pages/not-found-page';
import { Layout } from './layout';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="paises/:code" element={<DashboardPage />} />
        <Route path="sobre" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
