import { Link, useMatch } from 'react-router';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardControls } from './dashboard-controls';

export function SiteHeader() {
  const onWorld = useMatch('/') !== null;
  const onCountry = useMatch('/paises/:code') !== null;

  return (
    <header className="flex min-h-(--header-height) shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      <h1 className="text-base font-medium">
        <Link to="/">Mapp</Link>
      </h1>
      {(onWorld || onCountry) && <DashboardControls />}
    </header>
  );
}
