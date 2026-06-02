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

const navMain = [
  {
    title: "Overview",
    url: "/overview",
    icon: IconDashboard,
  },
  {
    title: "Sales",
    url: "#",
    icon: IconShoppingCart,
    items: [
      { title: "Sales Performance", url: "/sales" },
      { title: "Orders",            url: "/sales/orders" },
    ],
  },
  {
    title: "Telesales",
    url: "#",
    icon: IconPhoneCall,
    items: [
      { title: "Telesales Overview", url: "/telesales" },
      { title: "Call Log",           url: "/telesales/call-log" },
    ],
  },
  {
    title: "Products",
    url: "/products",
    icon: IconPackage,
  },
  {
    title: "Programs",
    url: "#",
    icon: IconGift,
    items: [
      { title: "Incentives & Bonuses", url: "/incentives" },
    ],
  },
]

const navSecondary = [
  { title: "Get Help", url: "#", icon: IconHelp },
]

const adminDocuments = [
  { name: "Leads",    url: "/leads",    icon: IconUsers },
  { name: "Data Hub", url: "/data-hub", icon: IconUpload },
  { name: "Exports",  url: "/exports",  icon: IconFileExport, desktopOnly: true },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'

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
