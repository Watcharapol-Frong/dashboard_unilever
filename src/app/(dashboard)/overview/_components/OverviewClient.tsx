'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type OverviewRow } from './columns'

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

  const months     = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))], [rows])

  const [rangeFrom,   setRangeFrom]   = useState<string | null>(null)
  const [rangeTo,     setRangeTo]     = useState<string | null>(null)
  const [hoverMonth,  setHoverMonth]  = useState<string | null>(null)
  const [filterCmg,   setFilterCmg]   = useState('all')

  const handleChipClick = (m: string) => {
    if (!rangeFrom || (rangeFrom && rangeTo)) {
      setRangeFrom(m); setRangeTo(null)
    } else if (m === rangeFrom) {
      setRangeFrom(null); setRangeTo(null)
    } else if (m < rangeFrom) {
      setRangeFrom(m); setRangeTo(rangeFrom)
    } else {
      setRangeTo(m)
    }
  }

  const filtered = useMemo(() => {
    const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
    return rows.filter(r => {
      if (filterCmg !== 'all' && r.dynamic_cmg !== filterCmg) return false
      if (rangeFrom) {
        if (!effectiveTo) return r.month === rangeFrom
        if (r.month < rangeFrom || r.month > effectiveTo) return false
      }
      return true
    })
  }, [rows, filterCmg, rangeFrom, rangeTo, hoverMonth])

  const kpi = useMemo(() => aggregate(filtered), [filtered])

  const byMonth = useMemo(() => {
    const monthSet = [...new Set(filtered.map(r => r.month))].sort()
    return monthSet.map(month => {
      const mRows = filtered.filter(r => r.month === month)
      const agg   = aggregate(mRows)
      const label = mRows[0]?.month_label ?? month
      return { month, month_label: label, ...agg }
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Month chip grid */}
        <div className="flex items-center gap-1 flex-wrap">
          {months.map(m => {
            const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
            const isFrom    = m === rangeFrom
            const isTo      = m === rangeTo
            const inRange   = rangeFrom && effectiveTo && m > rangeFrom && m < effectiveTo
            const isPreview = !rangeTo && rangeFrom && hoverMonth && m > rangeFrom && m <= hoverMonth

            const active = isFrom || isTo
            const mid    = inRange || isPreview

            return (
              <button
                key={m}
                onClick={() => handleChipClick(m)}
                onMouseEnter={() => setHoverMonth(m)}
                onMouseLeave={() => setHoverMonth(null)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors select-none',
                  active ? 'bg-primary text-primary-foreground shadow-sm'
                  : mid   ? 'bg-primary/20 text-primary'
                  :         'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                ].join(' ')}
              >
                {new Date(m).toLocaleDateString('en-GB', { month: 'short' })}
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-border hidden sm:block" />

        {/* CMG filter */}
        <Select value={filterCmg} onValueChange={setFilterCmg}>
          <SelectTrigger className="h-8 w-full sm:w-44 text-sm">
            <SelectValue placeholder="All CMG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CMG</SelectItem>
            {cmgOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        {(rangeFrom || filterCmg !== 'all') && (
          <button
            onClick={() => { setRangeFrom(null); setRangeTo(null); setFilterCmg('all') }}
            className="text-xs text-muted-foreground underline"
          >
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
