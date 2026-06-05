"use client"

import type { ComponentType } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useLanguage } from "@/context/LanguageContext"
import { t } from "@/lib/i18n"

type LucideIcon = ComponentType<{ className?: string }>

export function NavDocuments({
  items,
}: {
  items: {
    name: string
    url: string
    icon: LucideIcon
    desktopOnly?: boolean
  }[]
}) {
  const pathname = usePathname()
  const { lang } = useLanguage()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('nav.admin', lang)}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name} className={item.desktopOnly ? 'hidden lg:block' : undefined}>
            <SidebarMenuButton asChild tooltip={item.name} isActive={pathname === item.url}>
              <Link href={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
