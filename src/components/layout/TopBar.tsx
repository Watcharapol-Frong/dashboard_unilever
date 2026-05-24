'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'

const PAGE_LABELS: Record<string, string> = {
  '/overview':   'Overview',
  '/telesales':  'Telesales',
  '/sales':      'Sales',
  '/products':   'Products',
  '/leads':      'Leads',
  '/incentives': 'Incentives',
  '/data-hub':   'Data Hub',
  '/exports':    'Exports',
}

function getPageLabel(pathname: string) {
  for (const [path, label] of Object.entries(PAGE_LABELS)) {
    if (pathname === path || pathname.startsWith(path + '/')) return label
  }
  return 'Dashboard'
}

export function TopBar({ title }: { title?: string }) {
  const pathname  = usePathname()
  const pageLabel = title ?? getPageLabel(pathname)

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2">
      <SidebarTrigger className="h-8 w-8" />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
