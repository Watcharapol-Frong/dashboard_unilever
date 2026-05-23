'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, BarChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import { overviewColumns, type OverviewRow } from './columns'

type Agg = {
  hoc_sales: number
  new_customers: number
  retention: number
  ordered: number
  hoc_orders: number
  total_incentive: number
  sales_target: number
  total_calls: number
  reached: number
  total_agent_cost: number
  total_expense: number
  roi: number
  achievement: number
}

function aggregate(rows: OverviewRow[]): Agg {
  const s = (k: keyof OverviewRow) => rows.reduce((a, r) => a + (r[k] as number), 0)

  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')

  const monthSeen = new Set<string>()
  let total_calls = 0, reached = 0, total_incentive = 0, total_agent_cost = 0
  for (const r of rows) {
    if (!monthSeen.has(r.month)) {
      monthSeen.add(r.month)
      total_calls      += r.total_calls
      reached          += r.reached
      total_incentive  += r.total_incentive
      total_agent_cost += r.total_agent_cost
    }
  }

  const total_expense = total_incentive + total_agent_cost
  const roi           = total_expense > 0 ? hoc_sales  / total_expense : 0
  const achievement   = sales_target  > 0 ? (hoc_sales / sales_target) * 100 : 0

  return {
    hoc_sales, new_customers, retention, ordered, hoc_orders, total_incentive,
    sales_target, total_calls, reached,
    total_agent_cost, total_expense, roi, achievement,
  }
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(d => d.data as OverviewRow[])

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

const fmtBaht = (n: number) => `฿${fmt(n)}`

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useSWR<OverviewRow[]>('/api/data/overview', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))], [rows])
  const [filterCmg, setFilterCmg] = useState('all')

  const filtered = useMemo(() =>
    filterCmg === 'all' ? rows : rows.filter(r => r.dynamic_cmg === filterCmg),
    [rows, filterCmg]
  )

  const kpi = useMemo(() => aggregate(filtered), [filtered])

  const byMonth = useMemo(() => {
    const monthSet = [...new Set(filtered.map(r => r.month))].sort()
    return monthSet.map(month => {
      const mRows = filtered.filter(r => r.month === month)
      const agg   = aggregate(mRows)
      const label = mRows[0]?.month_label ?? month
      const total = agg.new_customers + agg.retention
      return {
        month, month_label: label, ...agg,
        new_pct:       total > 0 ? (agg.new_customers / total) * 100 : 0,
        retention_pct: total > 0 ? (agg.retention     / total) * 100 : 0,
      }
    })
  }, [filtered])

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
        <p className="text-xs">Please run Build Mart first</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* CMG Filter */}
      <div className="flex items-center gap-2">
        <Select value={filterCmg} onValueChange={setFilterCmg}>
          <SelectTrigger className="h-8 w-full sm:w-44 text-sm">
            <SelectValue placeholder="Dynamic CMG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CMG</SelectItem>
            {cmgOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterCmg !== 'all' && (
          <button onClick={() => setFilterCmg('all')} className="text-xs text-muted-foreground underline">
            Clear
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard title="HOC Sales" value={fmtBaht(kpi.hoc_sales)} sub={`Target ${fmtBaht(kpi.sales_target)}`} />
        <KpiCard
          title="Achievement"
          value={`${kpi.achievement.toFixed(1)}%`}
          sub={kpi.achievement >= 100 ? 'Target reached ✓' : 'Below target'}
          highlight={kpi.achievement >= 100 ? 'green' : kpi.achievement >= 80 ? 'yellow' : 'red'}
        />
        <KpiCard title="New Customers" value={kpi.new_customers.toLocaleString()} sub="HOC new customers" />
        <KpiCard title="Retention" value={kpi.retention.toLocaleString()} sub="HOC repeat customers" />
        <KpiCard title="Total Calls" value={kpi.total_calls.toLocaleString()} sub={`Reached ${kpi.reached.toLocaleString()}`} />
        <KpiCard
          title="ROI"
          value={kpi.roi > 0 ? `${kpi.roi.toFixed(2)}x` : '—'}
          sub="HOC Sales / Total Expense"
          highlight={kpi.roi >= 10 ? 'green' : kpi.roi >= 5 ? 'yellow' : kpi.roi > 0 ? 'red' : undefined}
        />
      </div>

      {/* HOC Sales vs Target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">HOC Sales vs Target</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={byMonth} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="sales" tickFormatter={fmt} tick={{ fontSize: 11 }} width={56} />
              <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'achievement') return [`${value.toFixed(1)}%`, 'Achievement']
                  return [fmtBaht(value), name === 'hoc_sales' ? 'HOC Sales' : 'Target']
                }}
              />
              <Legend />
              <Bar yAxisId="sales" dataKey="hoc_sales"    name="HOC Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="sales" dataKey="sales_target" name="Target"    fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              <Line yAxisId="pct" dataKey="achievement" name="achievement" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* New vs Retention (100% Stacked) + ROI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">New vs Retention Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)}%`,
                    name === 'new_pct' ? 'New' : 'Retention',
                  ]}
                />
                <Legend
                  formatter={(value: string) => value === 'new_pct' ? 'New' : 'Retention'}
                />
                <Bar dataKey="new_pct"       name="new_pct"       stackId="a" fill="#22c55e" />
                <Bar dataKey="retention_pct" name="retention_pct" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">ROI by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v}x`} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}x`, 'ROI']} />
                <Line dataKey="roi" name="ROI" type="monotone" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            key={filterCmg}
            columns={overviewColumns}
            data={filtered}
          />
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
