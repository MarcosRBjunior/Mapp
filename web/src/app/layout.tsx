import type { CSSProperties } from 'react';
import { Outlet } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DataBanner } from '../shared/ui/data-banner';
import { SiteFooter } from '../shared/ui/site-footer';
import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';

const SHELL_SIZES = {
  '--sidebar-width': 'calc(var(--spacing) * 60)',
  '--header-height': 'calc(var(--spacing) * 12)',
} as CSSProperties;

export function Layout() {
  return (
    <SidebarProvider style={SHELL_SIZES}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <DataBanner />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
