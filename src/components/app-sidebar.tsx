"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import {
  IconDashboard,
  IconHelp,
  IconGift,
  IconUsers,
  IconUpload,
  IconFileExport,
  IconShoppingCart,
  IconPhoneCall,
  IconPackage,
} from "@tabler/icons-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useLanguage } from "@/context/LanguageContext"
import { t } from "@/lib/i18n"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const { lang } = useLanguage()

  const navMain = [
    { title: t('nav.overview', lang),  url: '/overview',  icon: IconDashboard },
    {
      title: t('nav.sales', lang),
      url: '#',
      icon: IconShoppingCart,
      items: [
        { title: t('nav.salesPerformance', lang), url: '/sales' },
        { title: t('nav.orders', lang),           url: '/sales/orders' },
      ],
    },
    {
      title: t('nav.telesales', lang),
      url: '#',
      icon: IconPhoneCall,
      items: [
        { title: t('nav.telesalesOverview', lang), url: '/telesales' },
        { title: t('nav.callLog', lang),           url: '/telesales/call-log' },
      ],
    },
    { title: t('nav.products', lang),  url: '/products',  icon: IconPackage },
    {
      title: t('nav.programs', lang),
      url: '#',
      icon: IconGift,
      items: [
        { title: t('nav.incentives', lang), url: '/incentives' },
      ],
    },
  ]

  const navSecondary = [
    { title: t('nav.getHelp', lang), url: '#', icon: IconHelp },
  ]

  const adminDocuments = [
    { name: t('nav.leads', lang),   url: '/leads',    icon: IconUsers },
    { name: t('nav.dataHub', lang), url: '/data-hub', icon: IconUpload },
    { name: t('nav.exports', lang), url: '/exports',  icon: IconFileExport, desktopOnly: true },
  ]

  const activeNavMain = navMain.map(item => {
    const hasActiveSubItem = item.items?.some(sub => pathname === sub.url)
    return { ...item, isActive: hasActiveSubItem || pathname === item.url }
  })

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
              <Link href="/overview">
                <span className="text-base font-semibold">Unilever Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={activeNavMain} />
        {isAdmin && <NavDocuments items={adminDocuments} />}
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
