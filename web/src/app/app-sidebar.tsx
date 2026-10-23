import { InfoIcon, MapIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="offcanvas" {...props}>
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
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.isActive(pathname)}>
                      <NavLink to={item.to} end>
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
