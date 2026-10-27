import { InfoIcon, MapIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router';
import { dashboardSearch } from '../shared/url/dashboard-search';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const NAV_ITEMS = [
  {
    title: 'Mapa',
    to: '/',
    icon: MapIcon,
    isActive: (path: string) => path === '/' || path.startsWith('/paises/'),
  },
  { title: 'Sobre', to: '/sobre', icon: InfoIcon, isActive: (path: string) => path === '/sobre' },
];

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { pathname, search } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <aside aria-label="Menu lateral" className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-1.5">
            <MapIcon className="size-5" aria-hidden="true" />
            <span className="text-base font-semibold">Mapp</span>
            <span className="text-xs text-muted-foreground">COVID-19</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Principal">
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => {
                    const active = item.isActive(pathname);
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link
                            to={{ pathname: item.to, search: dashboardSearch(search) }}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            <item.icon aria-hidden="true" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </aside>
    </Sidebar>
  );
}
