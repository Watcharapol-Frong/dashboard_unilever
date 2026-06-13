'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import useSWR from 'swr'
import { DatabaseZap } from 'lucide-react'
import { useBuild } from '@/context/BuildContext'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'

const PAGE_LABEL_KEYS: Record<string, string> = {
  '/overview':   'topbar.overview',
  '/telesales':  'topbar.telesales',
  '/sales':      'topbar.sales',
  '/products':   'topbar.products',
  '/leads':      'topbar.leads',
  '/incentives': 'topbar.incentives',
  '/data-hub':   'topbar.dataHub',
  '/exports':    'topbar.exports',
}

interface Freshness {
  ok: boolean
  max_date: string | null
  last_refreshed: string | null
  attribution_days: number | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function formatRelative(iso: string | null, lang: string): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (lang === 'th') {
    if (diff < 60)    return 'เมื่อกี้'
    if (diff < 3600)  return `${Math.floor(diff / 60)} นาทีที่แล้ว`
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`
    return `${Math.floor(diff / 86400)} วันที่แล้ว`
  }
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
  const { buildVersion } = useBuild()
  const { lang } = useLanguage()

  const labelKey = Object.entries(PAGE_LABEL_KEYS).find(([path]) =>
    pathname === path || pathname.startsWith(path + '/')
  )?.[1] ?? 'topbar.dashboard'

  const pageLabel = title ?? t(labelKey, lang)

  const { data } = useSWR<Freshness>(
    ['/api/data/hub/freshness', buildVersion],
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
            {t('topbar.dataThrough', lang)}{' '}
            <span className="font-semibold text-foreground">{formatDate(freshness.max_date)}</span>
          </span>
          {freshness.last_refreshed && (
            <>
              <span className="opacity-40">·</span>
              <span>{t('topbar.updated', lang)} {formatRelative(freshness.last_refreshed, lang)}</span>
            </>
          )}
          {freshness.attribution_days && (
            <>
              <span className="opacity-40">·</span>
              <span>
                {t('topbar.attribution', lang).replace('{n}', String(freshness.attribution_days))}
              </span>
            </>
          )}
        </div>
      )}
    </header>
  )
}
