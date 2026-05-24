'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { fmtBaht, fmt } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { columns } from '../columns'
import { ShoppingBag, TrendingUp, UserPlus, UserCheck } from 'lucide-react'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'

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

// ── SWR fetcher (keepPreviousData so filters don't flash PageLoading) ─────────

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(j => {
    if (!j.ok) throw new Error(j.error ?? 'fetch error')
    return j.data as SalesData
  })

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

  // keepPreviousData: stale data stays visible while re-fetching → no full-page flash on filter change
  const { data, isLoading } = useSWR<SalesData>(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  if (isLoading && !data) return <PageLoading cols={4} />
  if (!data || data.kpi.total_sales === 0) {
    return <PageEmpty message="No telesales sales data available" hint="Please build mart first." />
  }

  const { kpi, by_period, recent_orders, options } = data

  const onlinePct  = kpi.total_sales > 0 ? (kpi.online_sales  / kpi.total_sales) * 100 : 0
  const offlinePct = kpi.total_sales > 0 ? (kpi.offline_sales / kpi.total_sales) * 100 : 0
  const hasFilter  = channel !== 'all' || cmg !== 'all' || agent !== 'all' || conversion !== 'all'

  const chartData = by_period.map(p => ({
    name:    p.period_label,
    Online:  p.online,
    Offline: p.offline,
  }))

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

            <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
              <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="All Channels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cmg} onValueChange={setCmg}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All CMG" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CMG</SelectItem>
                {options.cmg.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {options.agents.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

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

        {/* Sales Trend — area line chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sales Trend (Telesales Activity)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <AreaChart data={chartData} width={0} height={280} style={{ width: '100%' }}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="salesOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#003DA6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#003DA6" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="salesOffline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#EE2737" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#EE2737" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS}
                tickFormatter={v => fmtBaht(v)} width={65} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelClassName="text-xs font-bold"
                formatter={(value: any, name: string) => [fmtBaht(Number(value)), name]}
              />
              <Area type="monotone" dataKey="Online"  stroke="#003DA6" fillOpacity={1} fill="url(#salesOnline)"  strokeWidth={2} />
              <Area type="monotone" dataKey="Offline" stroke="#EE2737" fillOpacity={1} fill="url(#salesOffline)" strokeWidth={2} />
            </AreaChart>
          </CardContent>
        </Card>

        {/* Channel Distribution — 100% stacked bar */}
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
          <DataTable columns={columns} data={recent_orders} />
        </CardContent>
      </Card>
    </div>
  )
}
