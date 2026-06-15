'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Filter, Users, PhoneCall, Award, ShoppingBag } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { KpiCard }   from '@/components/dashboard/KpiCard'
import { KpiGrid }   from '@/components/dashboard/KpiGrid'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { PageLoadingTable, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtPct } from '@/lib/formatters'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'
import { leadsColumns, type Lead } from './columns'

interface Summary {
  kpi: { total: number; contacted: number; converted: number; orders: number }
  filters: { tiers: string[]; cmgs: string[]; agents: string[] }
}

interface LeadsPage {
  data: Lead[]
  total: number
  page: number
  limit: number
}

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

function buildUrl(base: string, params: Record<string, string | number>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== 'all') sp.set(k, String(v))
  }
  return `${base}?${sp.toString()}`
}

export default function LeadsClient() {
  const { lang } = useLanguage()
  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterTier,    setFilterTier]    = useState('all')
  const [filterContact, setFilterContact] = useState('all')
  const [filterConv,    setFilterConv]    = useState('all')
  const [filterCmg,     setFilterCmg]     = useState<string[]>([])
  const [filterAgent,   setFilterAgent]   = useState<string[]>([])
  const [page,          setPage]          = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  useEffect(() => { setPage(1) }, [filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const { data: summary, isLoading: summaryLoading, error: summaryError } =
    useSWR<Summary>('/api/data/leads/summary', fetcher, {
      revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300_000,
    })

  const pageUrl = useMemo(() => buildUrl('/api/data/leads', {
    page, search: debouncedSearch, tier: filterTier, contact: filterContact,
    conv: filterConv, cmg: filterCmg.join(','), agent: filterAgent.join(','),
  }), [page, debouncedSearch, filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const { data: leadsPage, isLoading: pageLoading, error: pageError } =
    useSWR<LeadsPage>(pageUrl, fetcher, {
      revalidateOnFocus: false, revalidateOnReconnect: false, keepPreviousData: true,
    })

  const kpi        = summary?.kpi
  const tiers      = summary?.filters.tiers  ?? []
  const cmgs       = summary?.filters.cmgs   ?? []
  const agents     = summary?.filters.agents ?? []
  const rows       = leadsPage?.data  ?? []
  const total      = leadsPage?.total ?? 0
  const limit      = leadsPage?.limit ?? PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const hasFilter = !!(search || filterTier !== 'all' || filterContact !== 'all' ||
                    filterConv !== 'all' || filterCmg.length > 0 || filterAgent.length > 0)

  const clearFilters = () => {
    setSearch(''); setFilterTier('all'); setFilterContact('all')
    setFilterConv('all'); setFilterCmg([]); setFilterAgent([])
  }

  if (summaryLoading) return <PageLoadingTable kpiCols={4} rows={8} />
  if (summaryError)   return <PageError message={summaryError.message} />
  if (!kpi || kpi.total === 0) return (
    <PageEmpty message={t('leads.noData', lang)} hint="Upload a leads file and run Build Mart first" />
  )

  return (
    <div className="space-y-6">

      <KpiGrid cols={4}>
        <KpiCard
          title={t('telesales.totalLeads', lang)}
          value={kpi.total.toLocaleString()}
          subtitle="Assigned telesales leads"
          icon={Users}
        />
        <KpiCard
          title={t('leads.contacted', lang)}
          value={kpi.contacted.toLocaleString()}
          subtitle={fmtPct(kpi.contacted, kpi.total)}
          icon={PhoneCall}
        />
        <KpiCard
          title={t('leads.converted', lang)}
          value={kpi.converted.toLocaleString()}
          subtitle={fmtPct(kpi.converted, kpi.total)}
          valueClassName="text-blue-600"
          icon={Award}
        />
        <KpiCard
          title={t('nav.orders', lang)}
          value={kpi.orders.toLocaleString()}
          subtitle={kpi.converted > 0 ? `avg ${(kpi.orders / kpi.converted).toFixed(1)}x / person` : undefined}
          valueClassName="text-green-600"
          icon={ShoppingBag}
        />
      </KpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter {t('leads.title', lang)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <FilterBar hasFilter={hasFilter} onClear={clearFilters}>
            <FilterSelect
              label={t('leads.allTiers', lang)}
              value={filterTier}
              onChange={setFilterTier}
              options={tiers.map(v => ({ value: v, label: v }))}
            />
            <FilterSelect
              label="Contact"
              value={filterContact}
              onChange={setFilterContact}
              options={[
                { value: 'reached',            label: t('leads.contacted', lang) },
                { value: 'called_not_reached', label: 'Not Reached' },
                { value: 'not_called',         label: 'Not Called' },
              ]}
            />
            <FilterSelect
              label="Conversion"
              value={filterConv}
              onChange={setFilterConv}
              options={[
                { value: 'converted',     label: t('leads.converted', lang) },
                { value: 'not_converted', label: t('leads.notConverted', lang) },
                { value: 'no_hoc_order',  label: 'No Order' },
              ]}
            />
            {cmgs.length > 0 && (
              <MultiSelect
                label="All CMG"
                value={filterCmg}
                onChange={setFilterCmg}
                options={cmgs.map(v => ({ value: v, label: v }))}
              />
            )}
            {agents.length > 0 && (
              <MultiSelect
                label={t('common.allAgents', lang)}
                value={filterAgent}
                onChange={setFilterAgent}
                options={agents.map(v => ({ value: v, label: v }))}
              />
            )}
          </FilterBar>
        </CardContent>
      </Card>

      {pageError && <PageError message={pageError.message} />}

      <div className={pageLoading ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
        <DataTable
          key={pageUrl}
          columns={leadsColumns}
          data={rows}
          searchKey="mmid"
          searchPlaceholder="Search MMID or name…"
          hidePagination
        />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total.toLocaleString()} results · page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 w-8 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 w-8 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 500
