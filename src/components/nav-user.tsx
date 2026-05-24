"use client"

import { useUser, useClerk } from '@clerk/nextjs'
import { IconLogout, IconDotsVertical, IconShield, IconUser } from "@tabler/icons-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

export function NavUser() {
  const { isMobile }       = useSidebar()
  const { user, isLoaded } = useUser()
  const { signOut }        = useClerk()

  if (!isLoaded || !user) return null

  const name   = user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User'
  const email  = user.primaryEmailAddress?.emailAddress ?? ''
  const avatar = user.imageUrl ?? ''
  const role   = (user.publicMetadata?.role as string) ?? 'viewer'
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg shrink-0">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
              <IconDotsVertical className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback className="rounded-lg text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Role badge */}
            <DropdownMenuItem disabled className="opacity-100 cursor-default">
              {role === 'admin'
                ? <><IconShield className="size-4 mr-2 text-[#003DA6]" /><span className="text-[#003DA6] font-semibold">Admin</span></>
                : <><IconUser   className="size-4 mr-2 text-gray-500"  /><span className="text-gray-500">Viewer</span></>
              }
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => signOut({ redirectUrl: '/login' })}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
            >
              <IconLogout className="size-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
