'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { DataTable } from '@/components/ui/data-table'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { PageLoadingTable, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { fmtPct } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Filter, Users, PhoneCall, Award, ShoppingBag } from 'lucide-react'
import { leadsColumns, type Lead } from './columns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
  const [search,        setSearch]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterTier,    setFilterTier]    = useState('all')
  const [filterContact, setFilterContact] = useState('all')
  const [filterConv,    setFilterConv]    = useState('all')
  const [filterCmg,     setFilterCmg]     = useState('all')
  const [filterAgent,   setFilterAgent]   = useState('all')
  const [page,          setPage]          = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  useEffect(() => { setPage(1) }, [filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const { data: summary, isLoading: summaryLoading, error: summaryError } =
    useSWR<Summary>('/api/data/leads/summary', fetcher, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300_000,
    })

  const pageUrl = useMemo(() => buildUrl('/api/data/leads', {
    page,
    search:  debouncedSearch,
    tier:    filterTier,
    contact: filterContact,
    conv:    filterConv,
    cmg:     filterCmg,
    agent:   filterAgent,
  }), [page, debouncedSearch, filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const { data: leadsPage, isLoading: pageLoading, error: pageError } =
    useSWR<LeadsPage>(pageUrl, fetcher, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
    })

  const kpi        = summary?.kpi
  const tiers      = summary?.filters.tiers  ?? []
  const cmgs       = summary?.filters.cmgs   ?? []
  const agents     = summary?.filters.agents ?? []
  const rows       = leadsPage?.data ?? []
  const total      = leadsPage?.total ?? 0
  const limit      = leadsPage?.limit ?? 500
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const hasFilter = !!(search || filterTier !== 'all' || filterContact !== 'all' ||
                    filterConv !== 'all' || filterCmg !== 'all' || filterAgent !== 'all')

  const clearFilters = () => {
    setSearch(''); setFilterTier('all'); setFilterContact('all')
    setFilterConv('all'); setFilterCmg('all'); setFilterAgent('all')
  }

  if (summaryLoading) return <PageLoadingTable kpiCols={4} rows={8} />
  if (summaryError)   return <PageError message={summaryError.message} />
  if (!kpi || kpi.total === 0) return (
    <PageEmpty message="No data available" hint="Upload a leads file and run Build Mart first" />
  )

  return (
    <div className="space-y-6">

      <KpiGrid cols={4}>
        <KpiCard
          title="Total Leads"
          value={kpi.total.toLocaleString()}
          subtitle="Assigned telesales leads"
          icon={Users}
        />
        <KpiCard
          title="Contacted"
          value={kpi.contacted.toLocaleString()}
          subtitle={fmtPct(kpi.contacted, kpi.total)}
          icon={PhoneCall}
        />
        <KpiCard
          title="Conversion"
          value={kpi.converted.toLocaleString()}
          subtitle={fmtPct(kpi.converted, kpi.total)}
          valueClassName="text-blue-600"
          icon={Award}
        />
        <KpiCard
          title="Orders"
          value={kpi.orders.toLocaleString()}
          subtitle={kpi.converted > 0 ? `avg ${(kpi.orders / kpi.converted).toFixed(1)}x / person` : undefined}
          valueClassName="text-green-600"
          icon={ShoppingBag}
        />
      </KpiGrid>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter & Search Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <FilterBar
            hasFilter={hasFilter}
            onClear={() => {
              setSearch(''); setFilterTier('all'); setFilterContact('all')
              setFilterConv('all'); setFilterCmg('all'); setFilterAgent('all')
            }}
          >
            {/* No search input here anymore, moved to DataTable */}
            <FilterSelect
              label="All Tiers"
              value={filterTier}
              onChange={setFilterTier}
              options={tierOptions.map(v => ({ value: v, label: v }))}
            />
            <FilterSelect
              label="Contact"
              value={filterContact}
              onChange={setFilterContact}
              options={[
                { value: 'reached',            label: 'Reached' },
                { value: 'called_not_reached', label: 'Not Reached' },
                { value: 'not_called',         label: 'Not Called' },
              ]}
            />
            <FilterSelect
              label="Conversion"
              value={filterConv}
              onChange={setFilterConv}
              options={[
                { value: 'converted',     label: 'Converted' },
                { value: 'not_converted', label: 'Not Converted' },
                { value: 'no_hoc_order',  label: 'No Order' },
              ]}
            />
            <FilterSelect
              label="All CMG"
              value={filterCmg}
              onChange={setFilterCmg}
              options={cmgOptions.map(v => ({ value: v, label: v }))}
            />
            <FilterSelect
              label="All Agents"
              value={filterAgent}
              onChange={setFilterAgent}
              options={agentOptions.map(v => ({ value: v, label: v }))}
            />
          </FilterBar>
        </CardContent>
      </Card>

      <DataTable
        key={`${filterTier}|${filterContact}|${filterConv}|${filterCmg}|${filterAgent}`}
        columns={leadsColumns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search MMID / Name..."
      />
    </div>
  )
}
