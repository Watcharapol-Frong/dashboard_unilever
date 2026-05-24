'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Legend, ResponsiveContainer, Tooltip, LabelList
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { fmtBaht, fmt } from '@/lib/formatters'
import { type OverviewRow } from './columns'
import {
  TrendingUp, Target, Users, UserPlus, PhoneCall, Award,
  Calendar, BarChart3, Calculator, DollarSign, Activity
} from 'lucide-react'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'

type Agg = {
  hoc_sales: number; new_customers: number; retention: number
  ordered: number; hoc_orders: number; total_incentive: number
  sales_target: number; total_calls: number; reached: number
  total_agent_cost: number; total_expense: number; roi: number; achievement: number
  online_sales: number; offline_sales: number
}

function aggregate(rows: OverviewRow[]): Agg {
  const s = (k: keyof OverviewRow) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')
  const online_sales  = s('online_sales')
  const offline_sales = s('offline_sales')

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
    online_sales, offline_sales,
  }
}

const salesChartConfig = {
  online_sales:  { label: 'Online Sales',  color: '#3b82f6' },
  offline_sales: { label: 'Offline Sales', color: '#10b981' },
  sales_target:  { label: 'Target',        color: '#e2e8f0' },
  achievement:   { label: 'Achievement',   color: '#f59e0b' },
} satisfies ChartConfig

const customerConfig = {
  new_val:    { label: 'New Customers',    color: '#10b981' },
  repeat_val: { label: 'Repeat Customers', color: '#3b82f6' },
} satisfies ChartConfig

const cohortConfig = {
  reactivated_customers: { label: 'Reactivated Customers', color: '#3b82f6' },
  new_customers:         { label: 'New Customers',         color: '#10b981' },
} satisfies ChartConfig

const renderLabel = (color: string) => (props: any) => {
  const { x, y, width, height, value } = props
  if (!value || Math.abs(value) < 1000) return null
  const absVal = Math.abs(value)
  const formatted = absVal >= 1000 ? `${(absVal / 1000).toFixed(0)}K` : absVal.toString()
  const displayVal = value < 0 ? `-${formatted}` : formatted
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      fill={color}
      textAnchor="middle"
      dominantBaseline="middle"
      className="text-[9px] font-extrabold select-none"
    >
      {displayVal}
    </text>
  )
}

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

interface TooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

function OverviewTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload

  // Check if this is the HOC Sales vs Target Trend chart
  const isSalesChart = 'online_sales' in data || 'offline_sales' in data || 'sales_target' in data

  if (isSalesChart) {
    const onlineSales  = Number(data.online_sales ?? 0)
    const offlineSales = Number(data.offline_sales ?? 0)
    const totalSales   = onlineSales + offlineSales
    const target       = Number(data.sales_target ?? 0)
    const achievement  = Number(data.achievement ?? 0)

    return (
      <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
        {/* Month Header */}
        <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
          {label}
        </div>

        {/* Total Section */}
        <div className="space-y-0.5">
          <div className="text-[10px] text-muted-foreground">Total Sales</div>
          <div className="text-base font-bold text-foreground">
            {fmtBaht(totalSales)}
          </div>
        </div>

        {/* Breakdown Section */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.online_sales.color }} />
              <span>Online Sales</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {fmtBaht(onlineSales)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.offline_sales.color }} />
              <span>Offline Sales</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {fmtBaht(offlineSales)}
            </span>
          </div>
        </div>

        {/* Divider */}
        <hr className="border-t border-border/80 border-dashed my-1.5" />

        {/* Target & Achievement Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-gray-300" style={{ backgroundColor: salesChartConfig.sales_target.color }} />
              <span>Target</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {target > 0 ? fmtBaht(target) : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.achievement.color }} />
              <span>Achievement</span>
            </div>
            <span className="font-semibold tabular-nums text-amber-600">
              {achievement.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Check if this is the Cohort retention chart
  const isCohortChart = 'reactivated_customers' in data || 'new_customers' in data

  if (isCohortChart) {
    const reactivated = Number(data.reactivated_customers ?? 0)
    const newCust = Number(data.new_customers ?? 0)
    const totalActive = reactivated + newCust

    return (
      <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
        {/* Period Header */}
        <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
          {label}
        </div>

        {/* Total Active Section */}
        <div className="space-y-0.5">
          <div className="text-[10px] text-muted-foreground">Total Buyers</div>
          <div className="text-base font-bold text-foreground">
            {totalActive.toLocaleString()}
          </div>
        </div>

        {/* Breakdown Section */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: '#3b82f6' }} />
              <span>Reactivated Customers</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {reactivated.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: '#10b981' }} />
              <span>New Customers</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {newCust.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Otherwise, it is the legacy/fallback Customer Segments chart
  const newVal    = Number(data.new_val ?? 0)
  const repeatVal = Number(data.repeat_val ?? 0)
  const totalCust = newVal + repeatVal
  const newPct    = totalCust > 0 ? (newVal / totalCust) * 100 : 0
  const repeatPct = totalCust > 0 ? (repeatVal / totalCust) * 100 : 0

  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
      {/* Month Header */}
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </div>

      {/* Total Section */}
      <div className="space-y-0.5">
        <div className="text-[10px] text-muted-foreground">Total Buyers</div>
        <div className="text-base font-bold text-foreground">
          {totalCust.toLocaleString()}
        </div>
      </div>

      {/* Breakdown Section */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: customerConfig.new_val.color }} />
            <span>New Customers</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">
            {newVal.toLocaleString()} ({newPct.toFixed(1)}%)
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: customerConfig.repeat_val.color }} />
            <span>Repeat Customers</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">
            {repeatVal.toLocaleString()} ({repeatPct.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  )
}

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useDashboardSWR<OverviewRow[]>('/api/data/overview')

  const months     = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))].sort(), [rows])

  const [rangeFrom,  setRangeFrom]  = useState<string | null>(null)
  const [rangeTo,    setRangeTo]    = useState<string | null>(null)
  const [hoverMonth, setHoverMonth] = useState<string | null>(null)
  const [filterCmg,  setFilterCmg]  = useState('all')
  const [filterChannel, setFilterChannel] = useState('all')

  const [cohortInterval, setCohortInterval] = useState<'monthly' | 'weekly' | 'custom'>('monthly')
  const [customStart, setCustomStart] = useState<string>('2026-02-01')
  const [customEnd, setCustomEnd] = useState<string>('2026-05-31')

  const durationDays = useMemo(() => {
    if (cohortInterval !== 'custom' || !customStart || !customEnd) return 0
    const start = new Date(customStart)
    const end = new Date(customEnd)
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }, [cohortInterval, customStart, customEnd])

  const calculatedInterval = useMemo(() => {
    if (cohortInterval !== 'custom') return cohortInterval
    // Auto granularity: daily ≤32 days, weekly 33–180 days, monthly >180 days
    if (durationDays <= 32) return 'daily'
    if (durationDays <= 180) return 'weekly'
    return 'monthly'
  }, [cohortInterval, durationDays])

  const cohortsQuery = `/api/data/cohorts?interval=${calculatedInterval}&cmg=${filterCmg}&channel=${filterChannel}` +
    (cohortInterval === 'custom'
      ? `${customStart ? `&startDate=${customStart}` : ''}${customEnd ? `&endDate=${customEnd}` : ''}`
      : `${rangeFrom ? `&startDate=${rangeFrom}` : ''}${rangeTo ? `&endDate=${rangeTo}` : ''}`
    )
  const { data: cohortData = [] } = useDashboardSWR<any[]>(cohortsQuery)

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

  const mappedFiltered = useMemo(() => {
    return filtered.map(r => {
      if (filterChannel === 'online') {
        const total = r.online_new_customers + r.online_retention
        return {
          ...r,
          hoc_sales: r.online_sales,
          hoc_orders: r.online_orders,
          new_customers: r.online_new_customers,
          retention: r.online_retention,
          ordered: total,
        }
      } else if (filterChannel === 'offline') {
        const total = r.offline_new_customers + r.offline_retention
        return {
          ...r,
          hoc_sales: r.offline_sales,
          hoc_orders: r.offline_orders,
          new_customers: r.offline_new_customers,
          retention: r.offline_retention,
          ordered: total,
        }
      }
      return r
    })
  }, [filtered, filterChannel])

  const kpi = useMemo(() => aggregate(mappedFiltered), [mappedFiltered])

  const byMonth = useMemo(() => {
    const monthSet = [...new Set(mappedFiltered.map(r => r.month))].sort()
    return monthSet.map(month => {
      const mRows = mappedFiltered.filter(r => r.month === month)
      const agg   = aggregate(mRows)
      return { month_label: mRows[0]?.month_label ?? month, ...agg }
    })
  }, [mappedFiltered])

  const customerChartData = useMemo(() => {
    return byMonth.map(m => {
      const total = m.new_customers + m.retention
      return {
        month_label: m.month_label,
        new_val: m.new_customers,
        repeat_val: m.retention,
        new_pct: total > 0 ? (m.new_customers / total) * 100 : 0,
        repeat_pct: total > 0 ? (m.retention / total) * 100 : 0,
      }
    })
  }, [byMonth])

  if (isLoading) return <PageLoading />
  if (rows.length === 0) return (
    <PageEmpty message="No data available" hint="Please run Build Mart first" />
  )

  const activeRangeLabel = (() => {
    if (!rangeFrom) return 'All available periods'
    const fromLabel = new Date(rangeFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    if (!rangeTo) return `Month: ${fromLabel}`
    const toLabel = new Date(rangeTo).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    return `${fromLabel} – ${toLabel}`
  })()

  return (
    <div className="space-y-6">

      {/* Date Range Selection & Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter & Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 flex-wrap">
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
                      'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none border',
                      active   ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                      : inRange || preview ? 'bg-[#003DA6]/10 text-[#003DA6] border-[#003DA6]/20'
                      : 'bg-background text-muted-foreground border-gray-200 hover:bg-gray-50 hover:text-foreground',
                    ].join(' ')}
                  >
                    {new Date(m).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  </button>
                )
              })}
            </div>

            <div className="w-px h-6 bg-border hidden lg:block" />

            <FilterSelect
              label="Customer Segmentation"
              value={filterCmg}
              onChange={setFilterCmg}
              options={cmgOptions.map(v => ({ value: v, label: v }))}
              width="w-full sm:w-56"
            />

            <FilterSelect
              label="All Channels"
              value={filterChannel}
              onChange={setFilterChannel}
              options={[
                { value: 'online', label: 'Online Sales' },
                { value: 'offline', label: 'Offline Sales' },
              ]}
              width="w-full sm:w-48"
            />

            {(rangeFrom || filterCmg !== 'all' || filterChannel !== 'all') && (
              <button
                onClick={() => { setRangeFrom(null); setRangeTo(null); setFilterCmg('all'); setFilterChannel('all') }}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <KpiGrid cols={6}>
        <KpiCard
          title="HOC Sales"
          value={fmtBaht(kpi.hoc_sales)}
          subtitle={`Target ${fmtBaht(kpi.sales_target)}`}
          icon={TrendingUp}
        />
        <KpiCard
          title="Achievement"
          value={`${kpi.achievement.toFixed(1)}%`}
          subtitle={kpi.achievement >= 100 ? 'Target reached ✓' : 'Below target'}
          valueClassName={achievementColor(kpi.achievement)}
          icon={Target}
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle="Telesales new buyers"
          icon={UserPlus}
        />
        <KpiCard
          title="Repeat Customers"
          value={kpi.retention.toLocaleString()}
          subtitle="Telesales repeat buyers"
          icon={Users}
        />
        <KpiCard
          title="Total Calls"
          value={kpi.total_calls.toLocaleString()}
          subtitle={`Reached ${kpi.reached.toLocaleString()}`}
          icon={PhoneCall}
        />
        <KpiCard
          title="Program ROI"
          value={kpi.roi > 0 ? `${kpi.roi.toFixed(2)}x` : '—'}
          subtitle="Sales / Expense multiplier"
          valueClassName={roiColor(kpi.roi)}
          icon={Calculator}
        />
      </KpiGrid>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* HOC Sales vs Target */}
        <Card className="w-full py-6 gap-8 shadow-xs border">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg font-medium">HOC Sales vs Target Trend</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-3xl font-semibold text-card-foreground">
                  {fmtBaht(kpi.hoc_sales)}
                </h3>
                <Badge
                  className={cn(
                    kpi.achievement >= 100 ? 'bg-green-50 text-green-600 border-green-200' : kpi.achievement >= 80 ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-red-50 text-red-500 border-red-200',
                    "shadow-none border font-semibold px-2 py-0.5"
                  )}
                  variant="outline"
                >
                  {kpi.achievement.toFixed(1)}%
                </Badge>
                <span className="text-xs text-muted-foreground">
                  of target ({fmtBaht(kpi.sales_target)})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.online_sales.color }} />
                <p className="text-sm text-muted-foreground">Online Sales</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.offline_sales.color }} />
                <p className="text-sm text-muted-foreground">Offline Sales</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border border-gray-300" style={{ backgroundColor: salesChartConfig.sales_target.color }} />
                <p className="text-sm text-muted-foreground">Target</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5" style={{ backgroundColor: salesChartConfig.achievement.color }} />
                <p className="text-sm text-muted-foreground">Achievement</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6">
            <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
              <ComposedChart data={byMonth} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144, 164, 174, 0.3)" />
                <XAxis dataKey="month_label" tickLine={false} tickMargin={10} axisLine={false} fontSize={12} />
                <YAxis yAxisId="sales" tickFormatter={fmt} tickLine={false} axisLine={false} tickMargin={10} fontSize={12} width={50} />
                <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} tickMargin={10} fontSize={12} width={40} />
                <ChartTooltip
                  cursor={false}
                  content={<OverviewTooltip />}
                />
                <Bar yAxisId="sales" dataKey="offline_sales" name="Offline Sales" fill="var(--color-offline_sales)" stackId="sales" radius={[0, 0, 0, 0]} barSize={48} />
                <Bar yAxisId="sales" dataKey="online_sales" name="Online Sales" fill="var(--color-online_sales)" stackId="sales" radius={[4, 4, 0, 0]} barSize={48} />
                <Bar yAxisId="sales" dataKey="sales_target" name="Target" fill="var(--color-sales_target)" radius={[4, 4, 0, 0]} barSize={48} />
                <Line yAxisId="pct" dataKey="achievement" name="Achievement" type="monotone" stroke="var(--color-achievement)" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Customer Acquisition & Cohort Retention stacked bar chart */}
        <Card className="w-full py-6 gap-8 shadow-xs border">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-4 px-6 pb-2">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg font-medium">New & Reactivated Customers Trend</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">
                  Granularity view of new and reactivated customer counts.
                </span>
                <span className="text-[10px] bg-blue-50 text-[#003DA6] px-2 py-0.5 rounded-full font-semibold">
                  Custom date range applied from top filters
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {/* Granularity selection buttons & Date Picker */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
                  <button
                    onClick={() => setCohortInterval('monthly')}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-all duration-200",
                      cohortInterval === 'monthly'
                        ? "bg-white text-[#003DA6] shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setCohortInterval('weekly')}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-all duration-200",
                      cohortInterval === 'weekly'
                        ? "bg-white text-[#003DA6] shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setCohortInterval('custom')}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-all duration-200",
                      cohortInterval === 'custom'
                        ? "bg-white text-[#003DA6] shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Custom
                  </button>
                </div>

                {cohortInterval === 'custom' && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                    <DateRangePicker
                      from={customStart}
                      to={customEnd}
                      onFromChange={setCustomStart}
                      onToChange={setCustomEnd}
                    />
                    {durationDays > 0 && (
                      <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase">
                        {calculatedInterval} · {durationDays}d
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Legends */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: '#3b82f6' }} />
                  <span className="text-xs text-muted-foreground font-medium">Reactivated</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: '#10b981' }} />
                  <span className="text-xs text-muted-foreground font-medium">New</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pt-4">
            <ChartContainer config={cohortConfig} className="h-[350px] w-full">
              <ComposedChart data={cohortData} margin={{ left: 10, right: 10, top: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144, 164, 174, 0.3)" />
                <XAxis dataKey="period_label" tickLine={false} tickMargin={10} axisLine={false} fontSize={11} />
                <YAxis 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={10} 
                  fontSize={11} 
                  tickFormatter={v => {
                    const absVal = Math.abs(v)
                    const formatted = absVal >= 1000 ? `${(absVal / 1000).toFixed(0)}K` : absVal.toString()
                    return v < 0 ? `-${formatted}` : formatted
                  }} 
                />
                <ChartTooltip
                  cursor={false}
                  content={<OverviewTooltip />}
                />
                <Bar dataKey="new_customers" fill="#10b981" stackId="cohort" barSize={calculatedInterval === 'weekly' ? 24 : 48}>
                  <LabelList dataKey="new_customers" content={renderLabel('#065f46')} />
                </Bar>
                <Bar dataKey="reactivated_customers" fill="#3b82f6" stackId="cohort" barSize={calculatedInterval === 'weekly' ? 24 : 48}>
                  <LabelList dataKey="reactivated_customers" content={renderLabel('#1e3a8a')} />
                </Bar>
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
