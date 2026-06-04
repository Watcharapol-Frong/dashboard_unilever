'use client'

import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange, lastDayOfMonth } from '@/hooks/useMonthRange'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'
import { fmtBaht, fmt, formatTHB } from '@/lib/formatters'
import { TrendingUp, Target, AlertCircle, Calendar } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesKpi {
  total_sales: number; total_online: number; total_offline: number
  total_orders: number; total_qty: number
  converted_sales: number; converted_online: number; converted_offline: number
  converted_orders: number; new_customers: number; retention_customers: number
  not_converted_sales: number; not_converted_online: number; not_converted_offline: number
  not_converted_orders: number
  avg_order_value: number
  cmp_converted_sales: number | null
  comparison_label: string | null
  current_period_label: string | null
  previous_period_label: string | null
}

interface PeriodRow {
  period: string; period_label: string
  total_online: number; total_offline: number
  converted_online: number; converted_offline: number
  not_converted_online: number; not_converted_offline: number
}

interface SalesData {
  kpi: SalesKpi
  by_period: PeriodRow[]
  options: { cmg: string[]; agents: string[] }
  months: string[]
}

type Interval  = 'monthly' | 'weekly' | 'custom'
type ChartView = 'all' | 'converted' | 'not_converted'

// ── Chart Config ──────────────────────────────────────────────────────────────

const salesChartConfig = {
  Online:  { label: 'Online',  color: '#003DA6' },
  Offline: { label: 'Offline', color: '#EE2737' },
} satisfies ChartConfig

// ── Channel Bar (visual online/offline breakdown) ─────────────────────────────

function ChannelBar({ label, online, offline, color }: {
  label: string; online: number; offline: number; color?: string
}) {
  const total   = online + offline
  const onPct   = total > 0 ? (online  / total) * 100 : 50
  const offPct  = total > 0 ? (offline / total) * 100 : 50
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">{fmtBaht(total)}</span>
      </div>
      <div className="h-5 rounded overflow-hidden flex shadow-sm">
        <div
          className="flex items-center justify-center text-white text-[9px] font-bold transition-all duration-300"
          style={{ width: `${onPct}%`, backgroundColor: '#003DA6' }}
        >
          {onPct >= 12 ? `${onPct.toFixed(0)}%` : ''}
        </div>
        <div
          className="flex items-center justify-center text-white text-[9px] font-bold transition-all duration-300"
          style={{ width: `${offPct}%`, backgroundColor: color ?? '#EE2737' }}
        >
          {offPct >= 12 ? `${offPct.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Online {formatTHB(online)}</span>
        <span>Offline {formatTHB(offline)}</span>
      </div>
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function SalesTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const online  = Number(payload.find(p => p.dataKey === 'Online')?.value  ?? 0)
  const offline = Number(payload.find(p => p.dataKey === 'Offline')?.value ?? 0)
  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div>
        <div className="text-[10px] text-muted-foreground">Total</div>
        <div className="text-base font-bold">{fmtBaht(online + offline)}</div>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-[#003DA6]" />
            <span>Online</span>
          </div>
          <span className="font-semibold tabular-nums">{fmtBaht(online)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-[#EE2737]" />
            <span>Offline</span>
          </div>
          <span className="font-semibold tabular-nums">{fmtBaht(offline)}</span>
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
  const [chartView,   setChartView]   = useState<ChartView>('all')

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
    if (channel.length > 0) p.set('channel', channel.join(','))
    if (cmg.length > 0)     p.set('cmg',     cmg.join(','))
    if (agent.length > 0)   p.set('agent',   agent.join(','))
    if (effectiveStart)     p.set('startDate', effectiveStart)
    if (effectiveEnd)       p.set('endDate',   effectiveEnd)
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, channel, cmg, agent, effectiveStart, effectiveEnd])

  const { data, isLoading, isValidating } = useDashboardSWR<SalesData>(apiUrl)

  if (isLoading && !data) return <PageLoading cols={3} />
  if (!data || data.months.length === 0) {
    return <PageEmpty message="No telesales sales data available" hint="Please build mart first." />
  }

  const { kpi, by_period, options, months } = data
  const kpiPeriodLabel = kpi.current_period_label ?? null

  const cmpTooltip = kpiPeriodLabel && kpi.previous_period_label
    ? `Comparing ${kpiPeriodLabel} vs ${kpi.previous_period_label}\n(current − previous) ÷ previous`
    : '(current − previous) ÷ previous'

  const hasFilter = channel.length > 0 || cmg.length > 0 || agent.length > 0
  const hasRange  = !!(rangeFrom || interval === 'custom')

  // Chart data — pick columns based on chartView
  const chartData = by_period.map(p => ({
    name:    p.period_label,
    Online:  chartView === 'converted'     ? p.converted_online
           : chartView === 'not_converted' ? p.not_converted_online
           : p.total_online,
    Offline: chartView === 'converted'     ? p.converted_offline
           : chartView === 'not_converted' ? p.not_converted_offline
           : p.total_offline,
  }))

  const intervalBadge = interval === 'custom' && durationDays > 0
    ? `${calculatedInterval} · ${durationDays}d`
    : `${calculatedInterval} view`

  const chartViewLabel =
    chartView === 'converted'     ? 'Converted Only' :
    chartView === 'not_converted' ? 'Not Converted'  : 'All Orders'

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

            <div className="flex flex-wrap items-center gap-4">
              <MultiSelect
                label="All Channels"
                value={channel}
                onChange={setChannel}
                options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]}
                width="w-[130px]"
              />
              <MultiSelect
                label="All Segments"
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
              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setCmg([]); setAgent([])
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
                <span className="ml-1">(latest) — select month chips to change period</span>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <KpiGrid cols={3}>
        <KpiCard
          title="Total Sales"
          value={fmtBaht(kpi.total_sales)}
          subtitle={`${fmt(kpi.total_qty)} units · ${kpi.total_orders.toLocaleString()} orders`}
          icon={TrendingUp}
          tooltip={`All HOC Unilever sales — converted + not-converted.\nOnline: ${formatTHB(kpi.total_online)}\nOffline: ${formatTHB(kpi.total_offline)}`}
        />
        <KpiCard
          title="Converted (HOC Sales)"
          value={fmtBaht(kpi.converted_sales)}
          subtitle={`New: ${kpi.new_customers.toLocaleString()} · Repeat: ${kpi.retention_customers.toLocaleString()}`}
          icon={Target}
          comparison={kpi.cmp_converted_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          comparisonTooltip={cmpTooltip}
          tooltip={`Orders within attribution window (new_customer + retention).\nOnline: ${formatTHB(kpi.converted_online)}\nOffline: ${formatTHB(kpi.converted_offline)}\n\nMatches Overview HOC Sales when same date range and CMG filter are applied.`}
        />
        <KpiCard
          title="Not Converted"
          value={fmtBaht(kpi.not_converted_sales)}
          subtitle={`${kpi.not_converted_orders.toLocaleString()} orders outside attribution window`}
          icon={AlertCircle}
          tooltip={`Orders outside attribution window (first_order_not_converted + retention_not_converted).\nOnline: ${formatTHB(kpi.not_converted_online)}\nOffline: ${formatTHB(kpi.not_converted_offline)}`}
        />
      </KpiGrid>

      {/* ── Sales Trend + Channel Breakdown ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend */}
        <Card className="lg:col-span-2 py-6 gap-4">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Sales Trend</CardTitle>
              {isValidating && !isLoading && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full animate-pulse">
                  Updating…
                </span>
              )}
            </div>
            {/* Chart view toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {(['all', 'converted', 'not_converted'] as ChartView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    chartView === v
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v === 'all' ? 'All' : v === 'converted' ? 'Converted' : 'Not Converted'}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-6 pt-2">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase">
                {intervalBadge}
              </span>
              <span className="text-[9px] text-muted-foreground">Showing: {chartViewLabel}</span>
            </div>
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

        {/* Channel Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Breakdown</CardTitle>
            <p className="text-xs text-muted-foreground">Online vs Offline by conversion group</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <ChannelBar
              label="All Orders"
              online={kpi.total_online}
              offline={kpi.total_offline}
            />
            <div className="border-t pt-4 space-y-5">
              <ChannelBar
                label="Converted"
                online={kpi.converted_online}
                offline={kpi.converted_offline}
                color="#059669"
              />
              <ChannelBar
                label="Not Converted"
                online={kpi.not_converted_online}
                offline={kpi.not_converted_offline}
                color="#d97706"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
