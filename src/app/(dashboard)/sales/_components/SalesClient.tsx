'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  ChartContainer, ChartTooltip, type ChartConfig,
} from '@/components/ui/chart'
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
import { TrendingUp, UserPlus, Users, CreditCard, Calendar } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Skeleton } from '@/components/ui/skeleton'

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

interface SalesData {
  kpi: SalesKpi
  by_period: {
    period: string
    period_label: string
    total_online: number
    total_offline: number
    converted_online: number
    converted_offline: number
    not_converted_online: number
    not_converted_offline: number
  }[]
  options: { cmg: string[]; agents: string[] }
  months: string[]
}

type Interval   = 'monthly' | 'weekly' | 'custom'
type Conversion = 'all' | 'converted' | 'not_converted'

type AgentRow = {
  agent: string
  sales_total: number
  order_total: number
  call_total: number
  converted_customers: number
  conversion_rate: number
}

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

// ── Channel Bar ───────────────────────────────────────────────────────────────

function ChannelBar({ label, online, offline }: { label: string; online: number; offline: number }) {
  const total      = online + offline
  const onlinePct  = total > 0 ? (online  / total) * 100 : 0
  const offlinePct = total > 0 ? (offline / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="w-full h-7 rounded-md overflow-hidden flex shadow-sm">
        <div
          className="h-full flex items-center justify-center text-white text-[10px] font-bold transition-all duration-500 min-w-0"
          style={{ width: `${onlinePct}%`, backgroundColor: '#003DA6' }}
        >
          {onlinePct >= 15 ? `${onlinePct.toFixed(0)}%` : ''}
        </div>
        <div
          className="h-full flex items-center justify-center text-white text-[10px] font-bold transition-all duration-500 min-w-0"
          style={{ width: `${offlinePct}%`, backgroundColor: '#EE2737' }}
        >
          {offlinePct >= 15 ? `${offlinePct.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Online {formatTHB(online)}</span>
        <span>Offline {formatTHB(offline)}</span>
      </div>
    </div>
  )
}

// ── Agent Columns ─────────────────────────────────────────────────────────────

const agentColumns: ColumnDef<AgentRow>[] = [
  {
    id: 'rank',
    header: '#',
    cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.index + 1}</span>,
  },
  {
    accessorKey: 'agent',
    header: 'Agent',
    cell: ({ row }) => <span className="font-medium text-sm">{row.original.agent}</span>,
  },
  {
    accessorKey: 'sales_total',
    header: () => <div className="text-right">HOC Sales</div>,
    cell: ({ row }) => <div className="text-right tabular-nums text-sm font-medium">{formatTHB(row.original.sales_total)}</div>,
  },
  {
    accessorKey: 'order_total',
    header: () => <div className="text-right">Orders</div>,
    cell: ({ row }) => <div className="text-right tabular-nums text-sm">{row.original.order_total.toLocaleString()}</div>,
  },
  {
    accessorKey: 'call_total',
    header: () => <div className="text-right">Calls</div>,
    cell: ({ row }) => <div className="text-right tabular-nums text-sm">{row.original.call_total.toLocaleString()}</div>,
  },
  {
    accessorKey: 'conversion_rate',
    header: () => <div className="text-right">Conv. Rate</div>,
    cell: ({ row }) => {
      const v = row.original.conversion_rate * 100
      const color = v >= 30 ? 'text-green-600' : v >= 15 ? 'text-yellow-600' : 'text-red-500'
      return <div className={`text-right tabular-nums text-sm font-semibold ${color}`}>{v.toFixed(1)}%</div>
    },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesClient() {
  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick: baseHandleChipClick, clearRange, activeRangeLabel,
  } = useMonthRange()
  const [interval,        setInterval]        = useState<Interval>('custom')
  const [customStart,     setCustomStart]     = useState('2026-05-01')
  const [customEnd,       setCustomEnd]       = useState('2026-05-31')
  const [channel,         setChannel]         = useState<string[]>([])
  const [cmg,             setCmg]             = useState<string[]>([])
  const [agent,           setAgent]           = useState<string[]>([])
  const [conversionView,  setConversionView]  = useState<Conversion>('all')

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
    if (channel.length > 0) p.set('channel',   channel.join(','))
    if (cmg.length > 0)     p.set('cmg',       cmg.join(','))
    if (agent.length > 0)   p.set('agent',     agent.join(','))
    if (effectiveStart)     p.set('startDate', effectiveStart)
    if (effectiveEnd)       p.set('endDate',   effectiveEnd)
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, channel, cmg, agent, effectiveStart, effectiveEnd])

  const { data, isLoading, isValidating } = useDashboardSWR<SalesData>(apiUrl)

  const agentsApiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart) p.set('startDate', effectiveStart)
    if (effectiveEnd)   p.set('endDate',   effectiveEnd)
    if (cmg.length > 0) p.set('cmg', cmg.join(','))
    return `/api/data/overview/agents?${p.toString()}`
  }, [effectiveStart, effectiveEnd, cmg])

  const { data: agentsData, isLoading: agentsLoading } = useDashboardSWR<AgentRow[]>(agentsApiUrl)

  if (isLoading && !data) return <PageLoading cols={4} />
  if (!data || data.months.length === 0) {
    return <PageEmpty message="No telesales sales data available" hint="Please build mart first." />
  }

  const { kpi, by_period, options, months } = data

  const hasFilter = channel.length > 0 || cmg.length > 0 || agent.length > 0 || conversionView !== 'all'
  const hasRange  = !!(rangeFrom || (interval === 'custom'))

  const kpiPeriodLabel = kpi.current_period_label ?? null

  const intervalBadge = interval === 'custom' && durationDays > 0
    ? `${calculatedInterval} · ${durationDays}d`
    : `${calculatedInterval} view`

  // ── Display values based on conversionView ────────────────────────────────
  const displaySales   = conversionView === 'converted' ? kpi.converted_sales   : conversionView === 'not_converted' ? kpi.not_converted_sales   : kpi.total_sales
  const displayOrders  = conversionView === 'converted' ? kpi.converted_orders  : conversionView === 'not_converted' ? kpi.not_converted_orders  : kpi.total_orders
  const displayOnline  = conversionView === 'converted' ? kpi.converted_online  : conversionView === 'not_converted' ? kpi.not_converted_online  : kpi.total_online
  const displayOffline = conversionView === 'converted' ? kpi.converted_offline : conversionView === 'not_converted' ? kpi.not_converted_offline : kpi.total_offline
  const displayAvgOV   = displayOrders > 0 ? displaySales / displayOrders : 0

  // ── Chart data based on conversionView ────────────────────────────────────
  const chartData = by_period.map(p => {
    if (conversionView === 'converted') {
      return { name: p.period_label, Online: p.converted_online, Offline: p.converted_offline }
    }
    if (conversionView === 'not_converted') {
      return { name: p.period_label, Online: p.not_converted_online, Offline: p.not_converted_offline }
    }
    return { name: p.period_label, Online: p.total_online, Offline: p.total_offline }
  })

  const channelBarLabel = conversionView === 'converted'
    ? 'Converted Orders'
    : conversionView === 'not_converted'
    ? 'Not Converted'
    : 'All Orders'

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

              <Select value={conversionView} onValueChange={v => setConversionView(v as Conversion)}>
                <SelectTrigger className="h-7 text-xs w-[155px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="converted">Converted Only</SelectItem>
                  <SelectItem value="not_converted">Not Converted</SelectItem>
                </SelectContent>
              </Select>

              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setCmg([]); setAgent([]); setConversionView('all')
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
          title="Total Sales"
          value={fmtBaht(displaySales)}
          subtitle={
            conversionView === 'converted'
              ? 'Converted orders only'
              : conversionView === 'not_converted'
              ? 'Not converted orders'
              : `${fmt(kpi.total_qty)} units · ${kpi.total_orders.toLocaleString()} orders`
          }
          icon={TrendingUp}
        />
        <KpiCard
          title="Avg Order Value"
          value={fmtBaht(displayAvgOV)}
          subtitle={`${displayOrders.toLocaleString()} orders`}
          icon={CreditCard}
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle="Converted new buyers"
          icon={UserPlus}
          comparison={kpi.cmp_converted_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
        <KpiCard
          title="Repeat Customers"
          value={kpi.retention_customers.toLocaleString()}
          subtitle="Converted repeat buyers"
          icon={Users}
        />
      </KpiGrid>

      {/* ── Sales Trend + Channel Breakdown ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend (2/3) */}
        <Card className="lg:col-span-2 py-6 gap-4">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">Sales Trend</CardTitle>
              {isValidating && !isLoading && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full animate-pulse">
                  Updating…
                </span>
              )}
            </div>
            <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
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

        {/* Channel Breakdown (1/3) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center gap-6 pt-2">
            <ChannelBar
              label={channelBarLabel}
              online={displayOnline}
              offline={displayOffline}
            />
            <div className="text-center space-y-0.5 pt-2">
              <div className="text-xs text-muted-foreground">Total Telesales Revenue</div>
              <div className="text-base font-bold text-foreground">{fmtBaht(displaySales)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Agent Performance Leaderboard ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Agent Performance Leaderboard</CardTitle>
          <p className="text-xs text-muted-foreground">HOC converted sales by agent — responds to date range and segment filters above</p>
        </CardHeader>
        <CardContent>
          {agentsLoading
            ? <Skeleton className="h-48 w-full" />
            : <DataTable columns={agentColumns} data={agentsData ?? []} />
          }
        </CardContent>
      </Card>

    </div>
  )
}
