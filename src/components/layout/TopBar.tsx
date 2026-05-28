'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useSWR from 'swr'
import { DatabaseZap } from 'lucide-react'
import { useBuild } from '@/context/BuildContext'

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

interface Freshness {
  ok: boolean
  max_date: string | null
  last_refreshed: string | null
  attribution_days: number | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TopBar({ title }: { title?: string }) {
  const pathname  = usePathname()
  const pageLabel = title ?? getPageLabel(pathname)
  const { buildVersion } = useBuild()

  const { data } = useSWR<Freshness>(
    ['/api/data/mart-freshness', buildVersion],
    ([url]: [string]) => fetcher(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  const freshness = data?.ok ? data : null

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

      {freshness?.max_date && (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <DatabaseZap className="h-3.5 w-3.5 text-[#003DA6]" />
          <span>
            Data through{' '}
            <span className="font-semibold text-foreground">{formatDate(freshness.max_date)}</span>
          </span>
          {freshness.last_refreshed && (
            <>
              <span className="opacity-40">·</span>
              <span>updated {formatRelative(freshness.last_refreshed)}</span>
            </>
          )}
          {freshness.attribution_days && (
            <>
              <span className="opacity-40">·</span>
              <span>{freshness.attribution_days}-day attribution</span>
            </>
          )}
        </div>
      )}
    </header>
  )
}
