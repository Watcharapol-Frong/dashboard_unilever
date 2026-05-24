'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { fmtBaht, fmt } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { columns } from '../columns'
import { ShoppingBag, TrendingUp, UserPlus, CreditCard, UserCheck } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesKpi {
  total_sales: number; online_sales: number; offline_sales: number
  total_orders: number; new_customers: number; converted_customers: number
  total_qty: number; avg_order_value: number
  cmp_total_sales: number | null; cmp_total_orders: number | null
  cmp_new_customers: number | null; cmp_avg_order_value: number | null
  cmp_converted_customers: number | null; comparison_label: string | null
}

interface SalesData {
  kpi: SalesKpi
  by_period: { period: string; period_label: string; online: number; offline: number; total: number }[]
  recent_orders: any[]
  options: { cmg: string[]; agents: string[] }
}

type Interval   = 'monthly' | 'weekly' | 'custom'
type Channel    = 'all' | 'online' | 'offline'
type Conversion = 'all' | 'converted' | 'not_converted'

// ── Chart config ──────────────────────────────────────────────────────────────

const trendConfig = {
  offline: { label: 'Offline', color: '#EE2737' },
  online:  { label: 'Online',  color: '#003DA6' },
  total:   { label: 'Total',   color: '#f59e0b' },
} satisfies ChartConfig

const BAR_SIZE: Record<string, number> = { daily: 10, weekly: 22, monthly: 44 }

// ── Trend Tooltip ─────────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="space-y-0.5">
        <div className="text-[10px] text-muted-foreground">Total Sales</div>
        <div className="text-base font-bold">{fmtBaht(Number(d.total ?? 0))}</div>
      </div>
      <div className="space-y-1.5 pt-1">
        {[
          { key: 'online',  color: '#003DA6', label: 'Online'  },
          { key: 'offline', color: '#EE2737', label: 'Offline' },
        ].map(({ key, color, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span>{label}</span>
            </div>
            <span className="font-semibold tabular-nums">{fmtBaht(Number(d[key] ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesClient() {
  const [interval,    setInterval]    = useState<Interval>('monthly')
  const [customStart, setCustomStart] = useState('2026-02-01')
  const [customEnd,   setCustomEnd]   = useState('2026-05-31')
  const [channel,     setChannel]     = useState<Channel>('all')
  const [cmg,         setCmg]         = useState('all')
  const [agent,       setAgent]       = useState('all')
  const [conversion,  setConversion]  = useState<Conversion>('all')

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000)
  }, [interval, customStart, customEnd])

  const calculatedInterval = useMemo<'daily' | 'weekly' | 'monthly'>(() => {
    if (interval !== 'custom') return interval
    return durationDays <= 32 ? 'daily' : 'weekly'
  }, [interval, durationDays])

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ interval: calculatedInterval })
    if (channel    !== 'all') p.set('channel',    channel)
    if (cmg        !== 'all') p.set('cmg',        cmg)
    if (agent      !== 'all') p.set('agent',      agent)
    if (conversion !== 'all') p.set('conversion', conversion)
    if (interval === 'custom') {
      if (customStart) p.set('startDate', customStart)
      if (customEnd)   p.set('endDate',   customEnd)
    }
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, interval, channel, cmg, agent, conversion, customStart, customEnd])

  const { data, isLoading } = useDashboardSWR<SalesData>(apiUrl)

  if (isLoading) return <PageLoading cols={4} />
  if (!data || data.kpi.total_sales === 0) {
    return <PageEmpty message="No telesales sales data available" hint="Please build mart first." />
  }

  const { kpi, by_period, recent_orders, options } = data

  const onlinePct  = kpi.total_sales > 0 ? (kpi.online_sales  / kpi.total_sales) * 100 : 0
  const offlinePct = kpi.total_sales > 0 ? (kpi.offline_sales / kpi.total_sales) * 100 : 0

  const hasFilter = channel !== 'all' || cmg !== 'all' || agent !== 'all' || conversion !== 'all'

  const barSize = BAR_SIZE[calculatedInterval] ?? BAR_SIZE.monthly

  return (
    <div className="space-y-6">

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filter & Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">

            {/* Interval tabs */}
            <div className="flex items-center bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
              {(['monthly', 'weekly', 'custom'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setInterval(v)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-bold transition-all duration-200 capitalize',
                    interval === v
                      ? 'bg-white text-[#003DA6] shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>

            {/* Date range (custom only) */}
            {interval === 'custom' && (
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

            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* Channel */}
            <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
              <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="All Channels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>

            {/* CMG */}
            <Select value={cmg} onValueChange={setCmg}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All CMG" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CMG</SelectItem>
                {options.cmg.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Agent */}
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {options.agents.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Conversion */}
            <Select value={conversion} onValueChange={v => setConversion(v as Conversion)}>
              <SelectTrigger className="h-7 text-xs w-[155px]"><SelectValue placeholder="All Customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="converted">Converted Only</SelectItem>
                <SelectItem value="not_converted">Not Converted</SelectItem>
              </SelectContent>
            </Select>

            {hasFilter && (
              <button
                onClick={() => { setChannel('all'); setCmg('all'); setAgent('all'); setConversion('all') }}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Sales (Telesales)"
          value={fmtBaht(kpi.total_sales)}
          subtitle={`${fmt(kpi.total_qty)} units sold`}
          icon={TrendingUp}
          comparison={kpi.cmp_total_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
        <KpiCard
          title="Total Orders"
          value={kpi.total_orders.toLocaleString()}
          subtitle={`Avg ${fmtBaht(kpi.avg_order_value)} / order`}
          icon={ShoppingBag}
          comparison={kpi.cmp_total_orders ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle="First-time telesales buyers"
          icon={UserPlus}
          comparison={kpi.cmp_new_customers ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
        <KpiCard
          title="Converted Customers"
          value={kpi.converted_customers.toLocaleString()}
          subtitle="New + retention customers"
          icon={UserCheck}
          comparison={kpi.cmp_converted_customers ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
      </KpiGrid>

      {/* ── Trend + Channel Distribution ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend */}
        <Card className="lg:col-span-2 py-6 shadow-xs border">
          <CardHeader className="px-6 pb-2">
            <CardTitle className="text-sm font-medium">Sales Trend (Telesales Activity)</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Online vs Offline revenue from telesales-attributed orders
            </p>
          </CardHeader>
          <CardContent className="px-6 pt-4">
            {isLoading ? (
              <Skeleton className="h-[280px] w-full rounded-xl" />
            ) : (
              <ChartContainer config={trendConfig} className="h-[280px] w-full">
                <ComposedChart data={by_period} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144,164,174,0.3)" />
                  <XAxis dataKey="period_label" tickLine={false} tickMargin={10} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false} axisLine={false} tickMargin={10} fontSize={11}
                    tickFormatter={v => fmtBaht(v)}
                    width={60}
                  />
                  <ChartTooltip cursor={false} content={<TrendTooltip />} />
                  <Bar dataKey="offline" fill="var(--color-offline)" stackId="s" barSize={barSize} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="online"  fill="var(--color-online)"  stackId="s" barSize={barSize} radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Channel Distribution — 100% stacked bar */}
        <Card className="py-6 shadow-xs border">
          <CardHeader className="px-6 pb-2">
            <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revenue split between online and offline channels
            </p>
          </CardHeader>
          <CardContent className="px-6 pt-4 flex flex-col justify-center h-[280px] gap-6">

            {/* Stacked bar */}
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

            {/* Labels */}
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

            {/* Total */}
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
          <DataTable columns={columns} data={recent_orders} />
        </CardContent>
      </Card>
    </div>
  )
}
