'use client'

import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/data-table'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { fmtPct } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Filter, Users, PhoneCall, Award, ShoppingBag } from 'lucide-react'
import { leadsColumns, type Lead } from './columns'

export default function LeadsClient() {
  const { data: rows = [], isLoading, error } = useDashboardSWR<Lead[]>('/api/data/leads')

  const [search,        setSearch]        = useState('')
  const [filterTier,    setFilterTier]    = useState('all')
  const [filterContact, setFilterContact] = useState('all')
  const [filterConv,    setFilterConv]    = useState('all')
  const [filterCmg,     setFilterCmg]     = useState('all')
  const [filterAgent,   setFilterAgent]   = useState('all')

  const tierOptions  = useMemo(() => [...new Set(rows.map(r => r.lead_customers))].sort(), [rows])
  const cmgOptions   = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg).filter(Boolean) as string[])].sort(), [rows])
  const agentOptions = useMemo(() => [...new Set(rows.map(r => r.agent).filter(Boolean) as string[])].sort(), [rows])

  const kpi = useMemo(() => {
    const total     = rows.length
    const contacted = rows.filter(r => r.contact_status !== 'not_called').length
    const converted = rows.filter(r => r.conversion_status === 'converted').length
    const orders    = rows.reduce((sum, r) => sum + r.hoc_orders, 0)
    return { total, contacted, converted, orders }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => {
      if (filterTier    !== 'all' && r.lead_customers    !== filterTier)   return false
      if (filterContact !== 'all' && r.contact_status    !== filterContact) return false
      if (filterConv    !== 'all' && r.conversion_status !== filterConv)   return false
      if (filterCmg     !== 'all' && r.dynamic_cmg       !== filterCmg)   return false
      if (filterAgent   !== 'all' && r.agent             !== filterAgent)  return false
      if (q && !r.mmid.toLowerCase().includes(q) && !r.cust_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const hasFilter = !!(search || filterTier !== 'all' || filterContact !== 'all' ||
                    filterConv !== 'all' || filterCmg !== 'all' || filterAgent !== 'all')

  if (isLoading) return <PageLoading />
  if (error)     return <PageError message={error.message} />
  if (rows.length === 0) return (
    <PageEmpty message="No data available" hint="Upload a leads file and run Build Mart first" />
  )

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
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
