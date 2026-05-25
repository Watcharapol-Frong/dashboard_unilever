'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
import { TrendingUp, UserPlus, Users, CreditCard, Calendar } from 'lucide-react'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesKpi {
  total_sales: number; online_sales: number; offline_sales: number
  total_orders: number; new_customers: number; retention_customers: number
  total_qty: number; avg_order_value: number
  cmp_total_sales: number | null; cmp_total_orders: number | null
  cmp_new_customers: number | null; cmp_avg_order_value: number | null
  cmp_retention_customers: number | null; comparison_label: string | null
}

interface SalesData {
  kpi: SalesKpi
  by_period: { period: string; period_label: string; online: number; offline: number; total: number }[]
  recent_orders: any[]
  options: { cmg: string[]; agents: string[] }
  months: string[]
}

type Interval   = 'monthly' | 'weekly' | 'custom'
type Channel    = 'all' | 'online' | 'offline'
type Conversion = 'all' | 'converted' | 'not_converted'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(j => {
    if (!j.ok) throw new Error(j.error ?? 'fetch error')
    return j.data as SalesData
  })

function lastDayOfMonth(isoDate: string) {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(y, m, 0).toISOString().split('T')[0]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesClient() {
  // Range chip state
  const [rangeFrom,   setRangeFrom]   = useState<string | null>(null)
  const [rangeTo,     setRangeTo]     = useState<string | null>(null)
  const [hoverMonth,  setHoverMonth]  = useState<string | null>(null)

  // Trend interval state
  const [interval,    setInterval]    = useState<Interval>('monthly')
  const [customStart, setCustomStart] = useState('2026-02-01')
  const [customEnd,   setCustomEnd]   = useState('2026-05-31')

  // Dimension filters
  const [channel,    setChannel]    = useState<Channel>('all')
  const [cmg,        setCmg]        = useState('all')
  const [agent,      setAgent]      = useState('all')
  const [conversion, setConversion] = useState<Conversion>('all')

  // Chip click — same logic as Overview
  const handleChipClick = (m: string) => {
    // Switching to chips clears custom date mode
    if (interval === 'custom') setInterval('monthly')
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

  // Switching to Custom mode clears chip range
  const handleIntervalChange = (v: Interval) => {
    if (v === 'custom') { setRangeFrom(null); setRangeTo(null) }
    setInterval(v)
  }

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000)
  }, [interval, customStart, customEnd])

  const calculatedInterval = useMemo<'daily' | 'weekly' | 'monthly'>(() => {
    if (interval !== 'custom') return interval
    return durationDays <= 32 ? 'daily' : 'weekly'
  }, [interval, durationDays])

  // Effective dates: chips take priority over custom date picker
  const effectiveStart = rangeFrom ?? (interval === 'custom' ? customStart : null)
  const effectiveEnd   = rangeFrom
    ? lastDayOfMonth(rangeTo ?? rangeFrom)
    : (interval === 'custom' ? customEnd : null)

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ interval: calculatedInterval })
    if (channel    !== 'all') p.set('channel',    channel)
    if (cmg        !== 'all') p.set('cmg',        cmg)
    if (agent      !== 'all') p.set('agent',      agent)
    if (conversion !== 'all') p.set('conversion', conversion)
    if (effectiveStart) p.set('startDate', effectiveStart)
    if (effectiveEnd)   p.set('endDate',   effectiveEnd)
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, channel, cmg, agent, conversion, effectiveStart, effectiveEnd])

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

  const { kpi, by_period, recent_orders, options, months } = data

  const onlinePct  = kpi.total_sales > 0 ? (kpi.online_sales  / kpi.total_sales) * 100 : 0
  const offlinePct = kpi.total_sales > 0 ? (kpi.offline_sales / kpi.total_sales) * 100 : 0
  const hasFilter  = channel !== 'all' || cmg !== 'all' || agent !== 'all' || conversion !== 'all'
  const hasRange   = !!(rangeFrom || (interval === 'custom' && customStart))

  const activeRangeLabel = (() => {
    if (!rangeFrom) return 'All available periods'
    const fromLabel = new Date(rangeFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    if (!rangeTo) return `Month: ${fromLabel}`
    const toLabel = new Date(rangeTo).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    return `${fromLabel} – ${toLabel}`
  })()

  const chartData = by_period.map(p => ({
    name:    p.period_label,
    Online:  p.online,
    Offline: p.offline,
  }))

  return (
    <div className="space-y-6">

      {/* ── Filter & Range Selection ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter & Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Month chips */}
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
                      active
                        ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                        : inRange || preview
                        ? 'bg-[#003DA6]/10 text-[#003DA6] border-[#003DA6]/20'
                        : 'bg-background text-muted-foreground border-gray-200 hover:bg-gray-50 hover:text-foreground',
                    ].join(' ')}
                  >
                    {new Date(m).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  </button>
                )
              })}
            </div>

            <div className="w-px h-6 bg-border hidden lg:block" />

            {/* Dimension filters */}
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

            {(hasFilter || hasRange) && (
              <button
                onClick={() => {
                  setChannel('all'); setCmg('all'); setAgent('all'); setConversion('all')
                  setRangeFrom(null); setRangeTo(null); setInterval('monthly')
                }}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                Reset All
              </button>
            )}
          </div>

          {rangeFrom && (
            <p className="text-xs text-muted-foreground mt-3">
              Selected: <span className="font-medium text-foreground">{activeRangeLabel}</span>
            </p>
          )}
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
          title="Avg Order Value"
          value={fmtBaht(kpi.avg_order_value)}
          subtitle={`${kpi.total_orders.toLocaleString()} orders total`}
          icon={CreditCard}
          comparison={kpi.cmp_avg_order_value ?? undefined}
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
          title="Retention Customers"
          value={kpi.retention_customers.toLocaleString()}
          subtitle="Repeat telesales buyers"
          icon={Users}
          comparison={kpi.cmp_retention_customers ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
      </KpiGrid>

      {/* ── Trend + Channel Distribution ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 pb-2">
            <CardTitle className="text-sm font-medium">Sales Trend (Telesales Activity)</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
                {(['monthly', 'weekly', 'custom'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => handleIntervalChange(v)}
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
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
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
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
            </ResponsiveContainer>
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
          <DataTable columns={columns} data={recent_orders} />
        </CardContent>
      </Card>
    </div>
  )
}
