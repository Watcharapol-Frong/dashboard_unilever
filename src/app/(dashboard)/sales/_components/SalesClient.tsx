'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  ChartContainer, ChartTooltip, type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange, lastDayOfMonth } from '@/hooks/useMonthRange'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'
import { fmtBaht, fmt } from '@/lib/formatters'
import { columns } from '../columns'
import { TrendingUp, UserPlus, Users, CreditCard, Calendar } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesKpi {
  total_sales: number; online_sales: number; offline_sales: number
  total_orders: number; new_customers: number; retention_customers: number
  total_qty: number; avg_order_value: number
  cmp_total_sales: number | null; cmp_total_orders: number | null
  cmp_new_customers: number | null; cmp_avg_order_value: number | null
  cmp_retention_customers: number | null; comparison_label: string | null
  current_period_label: string | null; previous_period_label: string | null
}

interface SalesData {
  kpi: SalesKpi
  by_period: { period: string; period_label: string; online: number; offline: number; total: number }[]
  recent_orders: any[]
  options: { cmg: string[]; agents: string[] }
  months: string[]
}

type Interval   = 'monthly' | 'weekly' | 'custom'
type Conversion = 'all' | 'converted' | 'not_converted'

// ── Chart Config ──────────────────────────────────────────────────────────────

const salesChartConfig = {
  Online:  { label: 'Online',  color: '#003DA6' },
  Offline: { label: 'Offline', color: '#EE2737' },
} satisfies ChartConfig

// ── Tooltip ───────────────────────────────────────────────────────────────────

function SalesTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const online  = Number(payload.find(p => p.dataKey === 'Online')?.value  ?? 0)
  const offline = Number(payload.find(p => p.dataKey === 'Offline')?.value ?? 0)
  const total   = online + offline
  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="space-y-0.5">
        <div className="text-[10px] text-muted-foreground">Total Sales</div>
        <div className="text-base font-bold text-foreground">{fmtBaht(total)}</div>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#003DA6' }} />
            <span>Online</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">{fmtBaht(online)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#EE2737' }} />
            <span>Offline</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">{fmtBaht(offline)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesClient() {
  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick: baseHandleChipClick, clearRange, activeRangeLabel,
  } = useMonthRange()
  const [interval,    setInterval]    = useState<Interval>('custom')
  const [customStart, setCustomStart] = useState('2026-05-01')
  const [customEnd,   setCustomEnd]   = useState('2026-05-31')
  const [channel,     setChannel]     = useState<string[]>([])
  const [cmg,         setCmg]         = useState<string[]>([])
  const [agent,       setAgent]       = useState<string[]>([])
  const [conversion,  setConversion]  = useState<Conversion>('all')
  const [orderSearch, setOrderSearch] = useState('')

  const handleChipClick = (m: string) => {
    if (interval === 'custom') setInterval('monthly')
    baseHandleChipClick(m)
  }

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000)
  }, [interval, customStart, customEnd])

  const calculatedInterval = useMemo<'daily' | 'weekly' | 'monthly'>(() => {
    if (interval === 'custom') return 'daily'
    if (rangeFrom && rangeTo && rangeFrom !== rangeTo) return 'monthly'
    return 'daily'
  }, [interval, rangeFrom, rangeTo])

  const effectiveStart = rangeFrom ?? (interval === 'custom' ? customStart : null)
  const effectiveEnd   = rangeFrom
    ? lastDayOfMonth(rangeTo ?? rangeFrom)
    : (interval === 'custom' ? customEnd : null)

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ interval: calculatedInterval })
    if (channel.length > 0)    p.set('channel',    channel.join(','))
    if (cmg.length > 0)        p.set('cmg',        cmg.join(','))
    if (agent.length > 0)      p.set('agent',      agent.join(','))
    if (conversion !== 'all')  p.set('conversion', conversion)
    if (effectiveStart)        p.set('startDate',  effectiveStart)
    if (effectiveEnd)          p.set('endDate',    effectiveEnd)
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, channel, cmg, agent, conversion, effectiveStart, effectiveEnd])

  const { data, isLoading, isValidating } = useDashboardSWR<SalesData>(apiUrl)

  if (isLoading && !data) return <PageLoading cols={4} />
  if (!data || data.months.length === 0) {
    return <PageEmpty message="No telesales sales data available" hint="Please build mart first." />
  }

  const { kpi, by_period, recent_orders, options, months } = data

  const filteredOrders = useMemo(() => {
    if (!orderSearch) return recent_orders ?? []
    const q = orderSearch.toLowerCase()
    return (recent_orders ?? []).filter((r: any) =>
      (r.mmid         ?? '').toLowerCase().includes(q) ||
      (r.order_number ?? '').toLowerCase().includes(q)
    )
  }, [recent_orders, orderSearch])

  const onlinePct  = kpi.total_sales > 0 ? (kpi.online_sales  / kpi.total_sales) * 100 : 0
  const offlinePct = kpi.total_sales > 0 ? (kpi.offline_sales / kpi.total_sales) * 100 : 0
  const hasFilter  = channel.length > 0 || cmg.length > 0 || agent.length > 0 || conversion !== 'all'
  const hasRange   = !!(rangeFrom || (interval === 'custom'))

  // Label for the period currently shown on KPI cards
  const kpiPeriodLabel = kpi.current_period_label ?? null

  // Tooltip text for the % comparison badge
  const cmpTooltip = (() => {
    if (kpiPeriodLabel && kpi.previous_period_label) {
      return `Comparing ${kpiPeriodLabel} vs ${kpi.previous_period_label}\n(current − previous) ÷ previous`
    }
    if (kpi.comparison_label === 'vs preceding period') {
      return `Comparing selected period vs the preceding period of equal length\n(current − previous) ÷ previous`
    }
    return `(current − previous) ÷ previous`
  })()

  const chartData = by_period.map(p => ({
    name:    p.period_label,
    Online:  p.online,
    Offline: p.offline,
  }))

  const intervalBadge = interval === 'custom' && durationDays > 0
    ? `${calculatedInterval} · ${durationDays}d`
    : `${calculatedInterval} view`

  return (
    <div className="space-y-6">

      {/* ── Filter & Range Selection ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter &amp; Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">

            {/* Row 1: Date chips + date picker */}
            <div className="flex flex-wrap items-center gap-4">
              <MonthChipGroup
                months={months}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                hoverMonth={hoverMonth}
                onChipClick={handleChipClick}
                onMouseEnter={setHoverMonth}
                onMouseLeave={() => setHoverMonth(null)}
              />

              <div className="flex items-center gap-2">
                <DateRangePicker
                  from={interval === 'custom' ? customStart : ''}
                  to={interval === 'custom' ? customEnd : ''}
                  onFromChange={start => { setCustomStart(start); clearRange(); setInterval('custom') }}
                  onToChange={end   => { setCustomEnd(end);   clearRange(); setInterval('custom') }}
                />
                {interval === 'custom' && durationDays > 0 && (
                  <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                    {calculatedInterval} · {durationDays}d
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Dropdown filters */}
            <div className="flex flex-wrap items-center gap-4">
              <MultiSelect
                label="All Channels"
                value={channel}
                onChange={setChannel}
                options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]}
                width="w-[130px]"
              />
              <MultiSelect
                label="All CMG"
                value={cmg}
                onChange={setCmg}
                options={options.cmg.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <MultiSelect
                label="All Agents"
                value={agent}
                onChange={setAgent}
                options={options.agents.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <Select value={conversion} onValueChange={v => setConversion(v as Conversion)}>
                <SelectTrigger className="h-7 text-xs w-[155px]"><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="converted">Converted Only</SelectItem>
                  <SelectItem value="not_converted">Not Converted</SelectItem>
                </SelectContent>
              </Select>

              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setCmg([]); setAgent([]); setConversion('all')
                    clearRange(); setInterval('custom')
                    setCustomStart('2026-05-01'); setCustomEnd('2026-05-31')
                  }}
                  className="text-xs text-[#003DA6] hover:underline font-semibold"
                >
                  Reset All
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            {rangeFrom ? (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{activeRangeLabel}</span>
              </p>
            ) : kpiPeriodLabel ? (
              <p className="text-xs text-muted-foreground">
                Showing: <span className="font-medium text-foreground">{kpiPeriodLabel}</span>
                <span className="ml-1">(latest available) — select month chips to change period</span>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Sales (Telesales)"
          value={fmtBaht(kpi.total_sales)}
          subtitle={kpiPeriodLabel ? `${kpiPeriodLabel} · ${fmt(kpi.total_qty)} units` : `${fmt(kpi.total_qty)} units sold`}
          icon={TrendingUp}
          comparison={kpi.cmp_total_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          comparisonTooltip={cmpTooltip}
          tooltip="HOC Unilever revenue for the displayed period — includes converted AND not-converted orders. Higher than Overview's HOC Sales which counts converted only. Use 'Converted Only' filter to align."
        />
        <KpiCard
          title="Avg Order Value"
          value={fmtBaht(kpi.avg_order_value)}
          subtitle={kpiPeriodLabel ? `${kpiPeriodLabel} · ${kpi.total_orders.toLocaleString()} orders` : `${kpi.total_orders.toLocaleString()} orders`}
          icon={CreditCard}
          comparison={kpi.cmp_avg_order_value ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          comparisonTooltip={cmpTooltip}
          tooltip="Total Sales ÷ Total Orders for the displayed period. Includes not-converted orders — switch to 'Converted Only' for attribution-window figures."
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle={kpiPeriodLabel ? `${kpiPeriodLabel} · first-time buyers` : 'First-time telesales buyers'}
          icon={UserPlus}
          comparison={kpi.cmp_new_customers ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          comparisonTooltip={cmpTooltip}
          tooltip="Unique first-time HOC buyers for the displayed period — includes both converted (within attribution window) and first-order-not-converted."
        />
        <KpiCard
          title="Retention Customers"
          value={kpi.retention_customers.toLocaleString()}
          subtitle={kpiPeriodLabel ? `${kpiPeriodLabel} · repeat buyers` : 'Repeat telesales buyers'}
          icon={Users}
          comparison={kpi.cmp_retention_customers ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          comparisonTooltip={cmpTooltip}
          tooltip="Unique repeat HOC buyers for the displayed period — includes both converted (within attribution window) and retention-not-converted."
        />
      </KpiGrid>

      {/* ── Sales Trend + Channel Distribution ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend */}
        <Card className="lg:col-span-2 py-6 gap-4">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Sales Trend (Telesales Activity)</CardTitle>
              {isValidating && !isLoading && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full animate-pulse">
                  Updating…
                </span>
              )}
            </div>
            <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase">
              {intervalBadge}
            </span>
          </CardHeader>
          <CardContent className="px-6 pt-2">
            <ChartContainer config={salesChartConfig} className="h-[280px] w-full">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#003DA6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#003DA6" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gradOffline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EE2737" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#EE2737" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144,164,174,0.3)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11}
                  tickFormatter={v => fmtBaht(v)} width={70} />
                <ChartTooltip cursor={false} content={props => <SalesTooltip {...props} />} />
                <Area type="monotone" dataKey="Online"  stroke="#003DA6" fillOpacity={1} fill="url(#gradOnline)"  strokeWidth={2} />
                <Area type="monotone" dataKey="Offline" stroke="#EE2737" fillOpacity={1} fill="url(#gradOffline)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center h-[300px] gap-6">
            <div className="w-full h-10 rounded-lg overflow-hidden flex shadow-sm">
              <div
                className="h-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500 min-w-0"
                style={{ width: `${onlinePct}%`, backgroundColor: '#003DA6' }}
              >
                {onlinePct >= 12 ? `${onlinePct.toFixed(0)}%` : ''}
              </div>
              <div
                className="h-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500 min-w-0"
                style={{ width: `${offlinePct}%`, backgroundColor: '#EE2737' }}
              >
                {offlinePct >= 12 ? `${offlinePct.toFixed(0)}%` : ''}
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#003DA6' }} />
                  <span className="font-semibold">Online {onlinePct.toFixed(1)}%</span>
                </div>
                <span className="text-muted-foreground pl-4">{fmtBaht(kpi.online_sales)}</span>
              </div>
              <div className="flex flex-col gap-1 items-end">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">Offline {offlinePct.toFixed(1)}%</span>
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#EE2737' }} />
                </div>
                <span className="text-muted-foreground pr-4">{fmtBaht(kpi.offline_sales)}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums">{fmtBaht(kpi.total_sales)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Telesales Revenue</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Orders Table ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Telesales Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredOrders}
            searchValue={orderSearch}
            onSearchChange={setOrderSearch}
            searchPlaceholder="Search MMID or Order No..."
          />
        </CardContent>
      </Card>
    </div>
  )
}
