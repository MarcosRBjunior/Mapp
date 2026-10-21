import { Link, NavLink, Outlet } from 'react-router';
import { DataBanner } from '../shared/ui/data-banner';
import { SiteFooter } from '../shared/ui/site-footer';

export function Layout() {
  return (
    <div className="app">
      <header className="site-header">
        <h1>
          <Link to="/">Mapp</Link>
        </h1>
        <nav aria-label="Principal">
          <NavLink to="/" end>
            Mapa
          </NavLink>
          <NavLink to="/sobre">Sobre</NavLink>
        </nav>
      </header>
      <DataBanner />
      <main className="content">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
