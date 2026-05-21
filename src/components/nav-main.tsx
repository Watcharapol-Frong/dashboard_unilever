"use client"

import { useState } from "react"
import type { ComponentType } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

type LucideIcon = ComponentType<{ className?: string }>

interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  items?: { title: string; url: string }[]
}

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const hasActive = item.items?.some(sub => pathname === sub.url) ?? false
  const [open, setOpen] = useState(hasActive)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={item.title} onClick={() => setOpen(o => !o)}>
        {item.icon && <item.icon />}
        <span>{item.title}</span>
        <ChevronRightIcon
          className="ml-auto transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {item.items!.map(sub => (
            <SidebarMenuSubItem key={sub.title}>
              <SidebarMenuSubButton asChild isActive={pathname === sub.url}>
                <Link href={sub.url}>
                  <span>{sub.title}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) =>
            item.items && item.items.length > 0 ? (
              <NavGroup key={item.title} item={item} pathname={pathname} />
            ) : (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
