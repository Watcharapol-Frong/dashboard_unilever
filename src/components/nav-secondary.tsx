"use client"

import * as React from "react"
import type { ComponentType } from "react"
import { useUser } from "@clerk/nextjs"
import { IconHelp } from "@tabler/icons-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { HelpSheet } from "@/components/dashboard/HelpSheet"
import { useLanguage } from "@/context/LanguageContext"
import { t } from "@/lib/i18n"

type LucideIcon = ComponentType<{ className?: string }>

interface NavItem {
  title: string
  url: string
  icon: LucideIcon
}

export function NavSecondary({
  items,
  ...props
}: {
  items: NavItem[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const [helpOpen, setHelpOpen] = React.useState(false)
  const { lang } = useLanguage()

  return (
    <>
      <SidebarGroup {...props}>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isHelp = item.title === t('nav.getHelp', lang)
              return (
                <SidebarMenuItem key={item.title}>
                  {isHelp ? (
                    <SidebarMenuButton type="button" tooltip={item.title} onClick={() => setHelpOpen(true)}>
                      <IconHelp />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <a href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} isAdmin={isAdmin} lang={lang} />
    </>
  )
}
