'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  LayoutDashboard, Phone, ShoppingCart, Package,
  Gift, Upload, Users,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { NavUser } from '@/components/nav-user'

const NAV_ITEMS = [
  { href: '/overview',   label: 'Overview',   icon: LayoutDashboard },
  { href: '/telesales',  label: 'Telesales',  icon: Phone },
  { href: '/sales',      label: 'Sales',      icon: ShoppingCart },
  { href: '/products',   label: 'Products',   icon: Package },
  { href: '/incentives', label: 'Incentives', icon: Gift },
]

const ADMIN_ITEMS = [
  { href: '/leads',      label: 'Leads',       icon: Users },
  { href: '/data-hub',   label: 'Data Hub',    icon: Upload },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { sessionClaims } = useAuth()
  const isAdmin = sessionClaims?.publicMetadata?.role === 'admin'

  return (
    <Sidebar collapsible="icon">
      {/* Header / Brand */}
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/20 font-bold text-white">
            U
          </div>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden justify-center">
            <span className="truncate text-sm font-bold text-white leading-tight">
              Unilever Project
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard group */}
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={label}
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href
                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={label}
                        >
                          <Link href={href}>
                            <Icon />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
