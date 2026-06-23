"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@/lib/clerk-client"
import {
  LayoutDashboard, ShoppingCart, Phone, Users,
  Database, Table2, HelpCircle,
} from "lucide-react"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"
import { useLanguage } from "@/context/LanguageContext"
import { t } from "@/lib/i18n"
import { useHelp } from "@/context/HelpContext"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const { lang } = useLanguage()
  const { isOpen, setOpen } = useHelp()

  const dashboardNav = [
    { title: t('topbar.overview', lang), url: "/dashboard",           icon: LayoutDashboard, exact: true  },
    { title: t('nav.sales', lang),       url: "/dashboard/sales",     icon: ShoppingCart,    exact: false },
    { title: t('nav.telesales', lang),   url: "/dashboard/telesales", icon: Phone,           exact: false },
    { title: t('nav.leads', lang),       url: "/leads",               icon: Users,           exact: false },
  ]

  const active = (url: string, exact: boolean) =>
    exact ? pathname === url : pathname.startsWith(url)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Unilever Project"
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard">
                <span className="text-base font-semibold">Unilever Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('topbar.dashboard', lang)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardNav.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={active(item.url, item.exact)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Data</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/raw-data')}
                  tooltip="Raw Data"
                >
                  <Link href="/raw-data">
                    <Table2 />
                    <span>Raw Data</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/data-hub')}
                    tooltip={t('nav.dataHub', lang)}
                  >
                    <Link href="/data-hub">
                      <Database />
                      <span>{t('nav.dataHub', lang)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Get Help"
              isActive={isOpen}
              onClick={() => setOpen(true)}
            >
              <HelpCircle />
              <span>{t('nav.getHelp', lang)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
