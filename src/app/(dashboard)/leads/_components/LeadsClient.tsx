'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Row = {
  lead_customers: string
  contact_status: 'not_called' | 'called_not_reached' | 'reached'
  conversion_status: 'new_customer' | 'retention' | 'not_converted' | 'no_hoc_order'
  lead_count: number
  hoc_sales: number
  avg_days_to_first_order: number | null
}

const CONVERSION_LABEL: Record<string, string> = {
  new_customer:  'New Customer',
  retention:     'Retention',
  not_converted: 'Not Converted',
  no_hoc_order:  'No HOC Order',
}
const CONVERSION_COLOR: Record<string, string> = {
  new_customer:  '#22c55e',
  retention:     '#3b82f6',
  not_converted: '#f59e0b',
  no_hoc_order:  '#e2e8f0',
}
const CONTACT_LABEL: Record<string, string> = {
  reached:             'Reached',
  called_not_reached:  'Called (no answer)',
  not_called:          'Not Called',
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(d => d.data as Row[])

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

const fmtBaht = (n: number) => `฿${fmt(n)}`
const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'

function sumBy(rows: Row[], key: keyof Row) {
  return rows.reduce((a, r) => a + (r[key] as number), 0)
}

export default function LeadsClient() {
  const { data: rows = [], isLoading } = useSWR<Row[]>('/api/data/leads', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const tierOptions = useMemo(
    () => ['all', ...[...new Set(rows.map(r => r.lead_customers))]],
    [rows]
  )

  const [filterTier, setFilterTier] = useState('all')

  const filtered = useMemo(
    () => filterTier === 'all' ? rows : rows.filter(r => r.lead_customers === filterTier),
    [rows, filterTier]
  )

  // ── KPIs ────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total     = sumBy(filtered, 'lead_count')
    const called    = sumBy(filtered.filter(r => r.contact_status !== 'not_called'), 'lead_count')
    const reached   = sumBy(filtered.filter(r => r.contact_status === 'reached'), 'lead_count')
    const converted = sumBy(
      filtered.filter(r => r.conversion_status === 'new_customer' || r.conversion_status === 'retention'),
      'lead_count'
    )
    const hoc_sales = sumBy(filtered, 'hoc_sales')

    // Weighted average of days_to_first_order for new_customer rows only
    const newRows = filtered.filter(r => r.conversion_status === 'new_customer' && r.avg_days_to_first_order !== null)
    const newTotal = sumBy(newRows, 'lead_count')
    const avgDays  = newTotal > 0
      ? newRows.reduce((a, r) => a + (r.avg_days_to_first_order! * r.lead_count), 0) / newTotal
      : null

    return { total, called, reached, converted, hoc_sales, avgDays }
  }, [filtered])

  // ── Funnel chart — 100% stacked bar per lead tier ────────────────
  const funnelData = useMemo(() => {
    const tiers = [...new Set(filtered.map(r => r.lead_customers))].sort()
    return tiers.map(tier => {
      const tierRows = filtered.filter(r => r.lead_customers === tier)
      const total = sumBy(tierRows, 'lead_count')
      const pct100 = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0
      return {
        tier,
        'New Customer':  pct100(sumBy(tierRows.filter(r => r.conversion_status === 'new_customer'), 'lead_count')),
        'Retention':     pct100(sumBy(tierRows.filter(r => r.conversion_status === 'retention'), 'lead_count')),
        'Not Converted': pct100(sumBy(tierRows.filter(r => r.conversion_status === 'not_converted'), 'lead_count')),
        'No HOC Order':  pct100(sumBy(tierRows.filter(r => r.conversion_status === 'no_hoc_order'), 'lead_count')),
        _total: total,
      }
    })
  }, [filtered])

  // ── Conversion status chart ────────────────────────────────────
  const conversionData = useMemo(() => {
    const statusMap = new Map<string, number>()
    for (const r of filtered) {
      statusMap.set(r.conversion_status, (statusMap.get(r.conversion_status) ?? 0) + r.lead_count)
    }
    return ['new_customer', 'retention', 'not_converted', 'no_hoc_order']
      .filter(s => statusMap.has(s))
      .map(s => ({ status: s, label: CONVERSION_LABEL[s], count: statusMap.get(s)! }))
  }, [filtered])

  // ── Contact status chart ───────────────────────────────────────
  const contactData = useMemo(() => {
    const statusMap = new Map<string, number>()
    for (const r of filtered) {
      statusMap.set(r.contact_status, (statusMap.get(r.contact_status) ?? 0) + r.lead_count)
    }
    return ['reached', 'called_not_reached', 'not_called']
      .filter(s => statusMap.has(s))
      .map(s => ({ status: s, label: CONTACT_LABEL[s], count: statusMap.get(s)! }))
  }, [filtered])

  // ── Per-tier summary table ─────────────────────────────────────
  const tierSummary = useMemo(() => {
    const tiers = [...new Set(rows.map(r => r.lead_customers))].sort()
    return tiers.map(tier => {
      const tierRows = rows.filter(r => r.lead_customers === tier)
      const total     = sumBy(tierRows, 'lead_count')
      const called    = sumBy(tierRows.filter(r => r.contact_status !== 'not_called'), 'lead_count')
      const reached   = sumBy(tierRows.filter(r => r.contact_status === 'reached'), 'lead_count')
      const newCust   = sumBy(tierRows.filter(r => r.conversion_status === 'new_customer'), 'lead_count')
      const retention = sumBy(tierRows.filter(r => r.conversion_status === 'retention'), 'lead_count')
      const hocSales  = sumBy(tierRows, 'hoc_sales')
      const newRows   = tierRows.filter(r => r.conversion_status === 'new_customer' && r.avg_days_to_first_order !== null)
      const newTotal  = sumBy(newRows, 'lead_count')
      const avgDays   = newTotal > 0
        ? newRows.reduce((a, r) => a + (r.avg_days_to_first_order! * r.lead_count), 0) / newTotal
        : null
      return { tier, total, called, reached, newCust, retention, hocSales, avgDays }
    })
  }, [rows])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <p>No data available</p>
        <p className="text-xs">Upload a leads file and run Build Mart first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Lead Tier" />
          </SelectTrigger>
          <SelectContent>
            {tierOptions.map(v => (
              <SelectItem key={v} value={v}>{v === 'all' ? 'All Tiers' : v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filterTier !== 'all' && (
          <button onClick={() => setFilterTier('all')} className="text-xs text-muted-foreground underline">
            Clear
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Leads"   value={kpi.total.toLocaleString()} />
        <KpiCard
          title="Call Rate"
          value={pct(kpi.called, kpi.total)}
          sub={`${kpi.called.toLocaleString()} called`}
          highlight={kpi.called / kpi.total >= 0.8 ? 'green' : kpi.called / kpi.total >= 0.5 ? 'yellow' : 'red'}
        />
        <KpiCard
          title="Reach Rate"
          value={pct(kpi.reached, kpi.called)}
          sub={`${kpi.reached.toLocaleString()} reached`}
          highlight={kpi.reached / kpi.called >= 0.6 ? 'green' : kpi.reached / kpi.called >= 0.4 ? 'yellow' : 'red'}
        />
        <KpiCard
          title="Conversion Rate"
          value={pct(kpi.converted, kpi.total)}
          sub={`${kpi.converted.toLocaleString()} converted`}
          highlight={kpi.converted / kpi.total >= 0.3 ? 'green' : kpi.converted / kpi.total >= 0.1 ? 'yellow' : 'red'}
        />
        <KpiCard title="HOC Sales"          value={fmtBaht(kpi.hoc_sales)} sub="from converted leads" />
        <KpiCard
          title="Avg Days to Order"
          value={kpi.avgDays !== null ? `${kpi.avgDays.toFixed(1)} days` : '—'}
          sub="first order after first call"
        />
      </div>

      {/* Chart A — Funnel per Lead Tier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Lead Funnel by Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="tier" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(value: number, name: string, props: { payload?: { _total?: number } }) => {
                  const total = props.payload?._total ?? 0
                  const count = total > 0 ? Math.round((value / 100) * total) : 0
                  return [`${value}% (${count.toLocaleString()})`, name]
                }}
              />
              <Legend />
              <Bar dataKey="New Customer"  stackId="a" fill="#22c55e" />
              <Bar dataKey="Retention"     stackId="a" fill="#3b82f6" />
              <Bar dataKey="Not Converted" stackId="a" fill="#f59e0b" />
              <Bar dataKey="No HOC Order"  stackId="a" fill="#e2e8f0" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Chart B + C side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Chart B — Conversion status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Conversion Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={conversionData}
                layout="vertical"
                margin={{ top: 4, right: 32, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Leads']} />
                <Bar dataKey="count" radius={[0,4,4,0]}>
                  {conversionData.map(d => (
                    <Cell key={d.status} fill={CONVERSION_COLOR[d.status] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart C — Contact status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Contact Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={contactData}
                layout="vertical"
                margin={{ top: 4, right: 32, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Leads']} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Table — per tier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Summary by Lead Tier</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Tier</th>
                <th className="text-right py-2 pr-3 font-medium">Total</th>
                <th className="text-right py-2 pr-3 font-medium">Called</th>
                <th className="text-right py-2 pr-3 font-medium">Call %</th>
                <th className="text-right py-2 pr-3 font-medium">Reached</th>
                <th className="text-right py-2 pr-3 font-medium">Reach %</th>
                <th className="text-right py-2 pr-3 font-medium">New</th>
                <th className="text-right py-2 pr-3 font-medium">Retention</th>
                <th className="text-right py-2 pr-3 font-medium">Conv %</th>
                <th className="text-right py-2 pr-3 font-medium">HOC Sales</th>
                <th className="text-right py-2 font-medium">Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {tierSummary.map(r => (
                <tr key={r.tier} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-1.5 pr-3 font-medium">{r.tier}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.total.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.called.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{pct(r.called, r.total)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.reached.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{pct(r.reached, r.called)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-green-600">{r.newCust.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-blue-600">{r.retention.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    <ConvBadge value={(r.newCust + r.retention) / r.total * 100} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtBaht(r.hocSales)}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.avgDays !== null ? `${r.avgDays.toFixed(1)}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({ title, value, sub, highlight }: {
  title: string; value: string; sub?: string; highlight?: 'green' | 'yellow' | 'red'
}) {
  const color =
    highlight === 'green'  ? 'text-green-600' :
    highlight === 'yellow' ? 'text-yellow-600' :
    highlight === 'red'    ? 'text-red-500' : ''
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

function ConvBadge({ value }: { value: number }) {
  const color =
    value >= 30 ? 'bg-green-100 text-green-700' :
    value >= 10 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {value.toFixed(1)}%
    </span>
  )
}
