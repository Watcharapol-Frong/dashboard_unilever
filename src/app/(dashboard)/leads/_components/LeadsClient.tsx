'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/ui/data-table'
import { leadsColumns, type Lead } from './columns'

const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'

const fetcher = async (url: string): Promise<Lead[]> => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data as Lead[]
}

export default function LeadsClient() {
  const { data: rows = [], isLoading, error } = useSWR<Lead[]>('/api/data/leads', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const [search,        setSearch]        = useState('')
  const [filterTier,    setFilterTier]    = useState('all')
  const [filterContact, setFilterContact] = useState('all')
  const [filterConv,    setFilterConv]    = useState('all')
  const [filterCmg,     setFilterCmg]     = useState('all')
  const [filterAgent,   setFilterAgent]   = useState('all')

  const tierOptions  = useMemo(() => [...new Set(rows.map(r => r.lead_customers))].sort(),  [rows])
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
      if (filterTier    !== 'all' && r.lead_customers    !== filterTier)    return false
      if (filterContact !== 'all' && r.contact_status    !== filterContact)  return false
      if (filterConv    !== 'all' && r.conversion_status !== filterConv)    return false
      if (filterCmg     !== 'all' && r.dynamic_cmg       !== filterCmg)    return false
      if (filterAgent   !== 'all' && r.agent             !== filterAgent)   return false
      if (q && !r.mmid.toLowerCase().includes(q) && !r.cust_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, filterTier, filterContact, filterConv, filterCmg, filterAgent])

  const hasFilter = search || filterTier !== 'all' || filterContact !== 'all' ||
                    filterConv !== 'all' || filterCmg !== 'all' || filterAgent !== 'all'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <p className="text-red-500">Failed to load data: {error.message}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <p>No data available</p>
        <p className="text-xs">Upload a leads file and run Build Mart first</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Total Leads" value={kpi.total.toLocaleString()} />
        <KpiCard title="Contacted"  value={kpi.contacted.toLocaleString()} sub={pct(kpi.contacted, kpi.total)} />
        <KpiCard title="Conversion" value={kpi.converted.toLocaleString()} sub={pct(kpi.converted, kpi.total)} highlight="blue" />
        <KpiCard
          title="Orders"
          value={kpi.orders.toLocaleString()}
          sub={kpi.converted > 0 ? `avg ${(kpi.orders / kpi.converted).toFixed(1)}x / person` : undefined}
          highlight="green"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search MMID / Name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />

        <Filter label="All Tiers" value={filterTier} onChange={setFilterTier}
          options={tierOptions.map(v => ({ value: v, label: v }))} />

        <Filter label="Contact" value={filterContact} onChange={setFilterContact}
          options={[
            { value: 'reached',            label: 'Reached' },
            { value: 'called_not_reached', label: 'Not Reached' },
            { value: 'not_called',         label: 'Not Called' },
          ]} />

        <Filter label="Conversion" value={filterConv} onChange={setFilterConv}
          options={[
            { value: 'converted',     label: 'Converted' },
            { value: 'not_converted', label: 'Not Converted' },
            { value: 'no_hoc_order',  label: 'No Order' },
          ]} />

        <Filter label="All CMG" value={filterCmg} onChange={setFilterCmg}
          options={cmgOptions.map(v => ({ value: v, label: v }))} />

        <Filter label="All Agents" value={filterAgent} onChange={setFilterAgent}
          options={agentOptions.map(v => ({ value: v, label: v }))} />

        {hasFilter && (
          <button
            onClick={() => {
              setSearch(''); setFilterTier('all'); setFilterContact('all')
              setFilterConv('all'); setFilterCmg('all'); setFilterAgent('all')
            }}
            className="text-xs text-muted-foreground underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} records
        </span>
      </div>

      {/* Table — key resets internal page index whenever filters change */}
      <DataTable
        key={`${search}|${filterTier}|${filterContact}|${filterConv}|${filterCmg}|${filterAgent}`}
        columns={leadsColumns}
        data={filtered}
      />
    </div>
  )
}

function Filter({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-36 text-sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function KpiCard({ title, value, sub, highlight }: {
  title: string; value: string; sub?: string; highlight?: 'blue' | 'green'
}) {
  const color = highlight === 'blue' ? 'text-blue-600' : highlight === 'green' ? 'text-green-600' : ''
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
