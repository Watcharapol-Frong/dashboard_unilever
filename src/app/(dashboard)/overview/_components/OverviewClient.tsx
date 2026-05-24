'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { fmtBaht, fmt } from '@/lib/formatters'
import { type OverviewRow } from './columns'

type Agg = {
  hoc_sales: number; new_customers: number; retention: number
  ordered: number; hoc_orders: number; total_incentive: number
  sales_target: number; total_calls: number; reached: number
  total_agent_cost: number; total_expense: number; roi: number; achievement: number
}

function aggregate(rows: OverviewRow[]): Agg {
  const s = (k: keyof OverviewRow) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')

  const seen = new Set<string>()
  let total_calls = 0, reached = 0, total_incentive = 0, total_agent_cost = 0
  for (const r of rows) {
    if (!seen.has(r.month)) {
      seen.add(r.month)
      total_calls      += r.total_calls
      reached          += r.reached
      total_incentive  += r.total_incentive
      total_agent_cost += r.total_agent_cost
    }
  }
  const total_expense = total_incentive + total_agent_cost
  const roi           = total_expense > 0 ? hoc_sales / total_expense : 0
  const achievement   = sales_target  > 0 ? (hoc_sales / sales_target) * 100 : 0
  return {
    hoc_sales, new_customers, retention, ordered, hoc_orders, total_incentive,
    sales_target, total_calls, reached, total_agent_cost, total_expense, roi, achievement,
  }
}

const chartConfig = {
  hoc_sales:    { label: 'HOC Sales',  color: '#3b82f6' },
  sales_target: { label: 'Target',     color: '#e2e8f0' },
  achievement:  { label: 'Achievement',color: '#f59e0b' },
} satisfies ChartConfig

function achievementColor(v: number) {
  if (v >= 100) return 'text-green-600'
  if (v >= 80)  return 'text-yellow-600'
  return 'text-red-500'
}
function roiColor(v: number) {
  if (v >= 10) return 'text-green-600'
  if (v >= 5)  return 'text-yellow-600'
  if (v > 0)   return 'text-red-500'
  return ''
}

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useDashboardSWR<OverviewRow[]>('/api/data/overview')

  const months     = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))].sort(), [rows])

  const [rangeFrom,  setRangeFrom]  = useState<string | null>(null)
  const [rangeTo,    setRangeTo]    = useState<string | null>(null)
  const [hoverMonth, setHoverMonth] = useState<string | null>(null)
  const [filterCmg,  setFilterCmg]  = useState('all')

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
      return { month_label: mRows[0]?.month_label ?? month, ...agg }
    })
  }, [filtered])

  if (isLoading) return <PageLoading />
  if (rows.length === 0) return (
    <PageEmpty message="No data available" hint="Please run Build Mart first" />
  )

  return (
    <div className="space-y-5">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {months.map(m => {
            const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
            const active  = m === rangeFrom || m === rangeTo
            const inRange = !!(rangeFrom && effectiveTo && m > rangeFrom && m < effectiveTo)
            const preview = !!(!rangeTo && rangeFrom && hoverMonth && m > rangeFrom && m <= hoverMonth)
            return (
              <button
                key={m}
                onClick={() => handleChipClick(m)}
                onMouseEnter={() => setHoverMonth(m)}
                onMouseLeave={() => setHoverMonth(null)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors select-none',
                  active   ? 'bg-primary text-primary-foreground shadow-sm'
                  : inRange || preview ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                ].join(' ')}
              >
                {new Date(m).toLocaleDateString('en-GB', { month: 'short' })}
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-border hidden sm:block" />

        <FilterSelect
          label="All CMG"
          value={filterCmg}
          onChange={setFilterCmg}
          options={cmgOptions.map(v => ({ value: v, label: v }))}
          width="w-full sm:w-44"
        />

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
      <KpiGrid cols={6}>
        <KpiCard
          title="HOC Sales"
          value={fmtBaht(kpi.hoc_sales)}
          subtitle={`Target ${fmtBaht(kpi.sales_target)}`}
        />
        <KpiCard
          title="Achievement"
          value={`${kpi.achievement.toFixed(1)}%`}
          subtitle={kpi.achievement >= 100 ? 'Target reached ✓' : 'Below target'}
          valueClassName={achievementColor(kpi.achievement)}
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle="HOC new"
        />
        <KpiCard
          title="Retention"
          value={kpi.retention.toLocaleString()}
          subtitle="HOC repeat"
        />
        <KpiCard
          title="Total Calls"
          value={kpi.total_calls.toLocaleString()}
          subtitle={`Reached ${kpi.reached.toLocaleString()}`}
        />
        <KpiCard
          title="ROI"
          value={kpi.roi > 0 ? `${kpi.roi.toFixed(2)}x` : '—'}
          subtitle="Sales / Expense"
          valueClassName={roiColor(kpi.roi)}
        />
      </KpiGrid>

      {/* HOC Sales vs Target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">HOC Sales vs Target</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ComposedChart data={byMonth} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month_label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="sales" tickFormatter={fmt} tick={{ fontSize: 11 }} width={56} axisLine={false} tickLine={false} />
              <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={44} axisLine={false} tickLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      if (name === 'achievement') return [`${Number(value).toFixed(1)}%`, 'Achievement']
                      return [fmtBaht(Number(value)), name === 'hoc_sales' ? 'HOC Sales' : 'Target']
                    }}
                  />
                }
              />
              <Legend />
              <Bar yAxisId="sales" dataKey="hoc_sales"    name="HOC Sales" fill="var(--color-hoc_sales)"    radius={[4, 4, 0, 0]} />
              <Bar yAxisId="sales" dataKey="sales_target" name="Target"    fill="var(--color-sales_target)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="pct" dataKey="achievement" name="Achievement" type="monotone" stroke="var(--color-achievement)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
