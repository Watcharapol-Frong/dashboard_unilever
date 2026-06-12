'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

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

// ── Component ─────────────────────────────────────────────────────────────────

// ── Call status options (Thai DB values) ──────────────────────────────────────

const CALL_STATUS_OPTIONS = [
  'สั่งซื้อสินค้าเรียบร้อย',
  'สั่งสินค้าอื่นๆ',
  'เสนอราคาแล้ว อยู่ระหว่างรอการยืนยันคำสั่งซื้อ',
  'นัดหมายติดต่อกลับ',
  'ไม่สะดวกคุย',
  'ไม่รับสาย 1',
  'ไม่รับสาย 2',
  'ไม่รับสาย 3',
  'ไม่รับสาย',
  'ไม่รับสาย/สายว่างแต่ไม่รับ',
  'ยังไม่ต้องการสินค้า',
  'ปิดเครื่อง/ติดต่อไม่ได้',
  'สายไม่ว่าง',
  'เบอร์ผิด/ไม่มีสัญญาน',
  'สายว่างไม่มีคนรับ',
  'เบอร์บ้านไม่มีคนรับ',
]

export default function SalesClient() {
  const { lang } = useLanguage()
  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick: baseHandleChipClick, clearRange, activeRangeLabel,
  } = useMonthRange()
  const [interval,        setInterval]        = useState<Interval>('monthly')
  const [customStart,     setCustomStart]     = useState('2026-05-01')
  const [customEnd,       setCustomEnd]       = useState('2026-05-31')
  const [channel,         setChannel]         = useState<string[]>([])
  const [cmg,             setCmg]             = useState<string[]>([])
  const [agent,           setAgent]           = useState<string[]>([])
  const [callStatus,      setCallStatus]      = useState<string[]>([])
  const [filterConv,      setFilterConv]      = useState<Conversion>('all')

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

  const effectiveStart = rangeFrom ?? (interval === 'custom' && customStart ? customStart : null)
  const effectiveEnd   = rangeFrom
    ? lastDayOfMonth(rangeTo ?? rangeFrom)
    : (interval === 'custom' && customEnd ? customEnd : null)

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams({ interval: calculatedInterval })
    if (channel.length > 0) p.set('channel',   channel.join(','))
    if (cmg.length > 0)     p.set('cmg',       cmg.join(','))
    if (agent.length > 0)   p.set('agent',     agent.join(','))
    if (callStatus.length > 0) p.set('callStatus', callStatus.join(','))
    if (filterConv !== 'all') p.set('filterConv', filterConv)
    if (effectiveStart)     p.set('startDate', effectiveStart)
    if (effectiveEnd)       p.set('endDate',   effectiveEnd)
    return `/api/data/sales?${p.toString()}`
  }, [calculatedInterval, channel, cmg, agent, callStatus, filterConv, effectiveStart, effectiveEnd])

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
    return <PageEmpty message={t('sales.noData', lang)} hint={t('common.buildFirst', lang)} />
  }

  const { kpi, by_period, options, months } = data

  const hasFilter = channel.length > 0 || cmg.length > 0 || agent.length > 0 || callStatus.length > 0 || filterConv !== 'all'
  const hasRange  = !!(rangeFrom || (interval === 'custom'))

  const kpiPeriodLabel = kpi.current_period_label ?? null

  const intervalBadge = interval === 'custom' && durationDays > 0
    ? `${calculatedInterval} · ${durationDays}d`
    : `${calculatedInterval} view`

  // ── Display values based on server response (already filtered) ─────────────
  const displaySales   = kpi.total_sales
  const displayOrders  = kpi.total_orders
  const displayOnline  = kpi.total_online
  const displayOffline = kpi.total_offline
  const displayAvgOV   = displayOrders > 0 ? displaySales / displayOrders : 0

  // ── Chart data based on server response ───────────────────────────────────
  const chartData = by_period.map(p => ({
    name:    p.period_label,
    Online:  p.total_online,
    Offline: p.total_offline,
  }))

  const channelBarLabel = filterConv === 'converted'
    ? t('sales.convertedOrders', lang)
    : filterConv === 'not_converted'
    ? t('sales.notConverted', lang)
    : t('sales.allOrders', lang)

  return (
    <div className="space-y-6">

      {/* ── Filter & Range Selection ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">{t('common.filterRange', lang)}</CardTitle>
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
                label={t('common.allChannels', lang)}
                value={channel}
                onChange={setChannel}
                options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]}
                width="w-[130px]"
              />
              <MultiSelect
                label={t('common.allSegments', lang)}
                value={cmg}
                onChange={setCmg}
                options={options.cmg.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <MultiSelect
                label={t('common.allAgents', lang)}
                value={agent}
                onChange={setAgent}
                options={options.agents.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <MultiSelect
                label={t('common.allStatuses', lang)}
                value={callStatus}
                onChange={setCallStatus}
                options={CALL_STATUS_OPTIONS.map(v => ({ value: v, label: v }))}
                width="w-[160px]"
              />

              <Select value={filterConv} onValueChange={v => setFilterConv(v as Conversion)}>
                <SelectTrigger className="h-7 text-xs w-[155px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allCustomers', lang)}</SelectItem>
                  <SelectItem value="converted">{t('sales.convertedOnly', lang)}</SelectItem>
                  <SelectItem value="not_converted">{t('sales.notConverted', lang)}</SelectItem>
                </SelectContent>
              </Select>

              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setCmg([]); setAgent([]); setCallStatus([]); setFilterConv('all')
                    clearRange(); setInterval('custom')
                    setCustomStart('2026-05-01'); setCustomEnd('2026-05-31')
                  }}
                  className="text-xs text-[#003DA6] hover:underline font-semibold"
                >
                  {t('common.resetAll', lang)}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            {rangeFrom ? (
              <p className="text-xs text-muted-foreground">
                {t('common.selected', lang)}: <span className="font-medium text-foreground">{activeRangeLabel}</span>
              </p>
            ) : kpiPeriodLabel ? (
              <p className="text-xs text-muted-foreground">
                {t('common.showing', lang)}: <span className="font-medium text-foreground">{kpiPeriodLabel}</span>
                <span className="ml-1">({t('sales.latestAvailable', lang)}) — {t('sales.selectToChange', lang)}</span>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <KpiGrid cols={4}>
        <KpiCard
          title={t('sales.totalSales', lang)}
          value={fmtBaht(displaySales)}
          subtitle={
            filterConv === 'converted'
              ? t('sales.convertedOrdersOnly', lang)
              : filterConv === 'not_converted'
              ? t('sales.notConvertedOrders', lang)
              : `${fmt(kpi.total_qty)} ${t('common.units', lang)} · ${kpi.total_orders.toLocaleString()} ${t('common.orders', lang)}`
          }
          icon={TrendingUp}
        />
        <KpiCard
          title={t('sales.avgOrderValue', lang)}
          value={fmtBaht(displayAvgOV)}
          subtitle={`${displayOrders.toLocaleString()} ${t('common.orders', lang)}`}
          icon={CreditCard}
        />
        <KpiCard
          title={t('kpi.newCustomers', lang)}
          value={kpi.new_customers.toLocaleString()}
          subtitle={t('kpi.convertedNewBuyers', lang)}
          icon={UserPlus}
          comparison={kpi.cmp_converted_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
        />
        <KpiCard
          title={t('kpi.repeatCustomers', lang)}
          value={kpi.retention_customers.toLocaleString()}
          subtitle={t('kpi.convertedRepeatBuyers', lang)}
          icon={Users}
        />
      </KpiGrid>

      {/* ── Sales Trend + Channel Breakdown ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend (2/3) */}
        <Card className="lg:col-span-2 py-6 gap-4">
          <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">{t('sales.trend', lang)}</CardTitle>
              {isValidating && !isLoading && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full animate-pulse">
                  {t('common.updating', lang)}
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
            <CardTitle className="text-sm font-medium">{t('sales.channelBreakdown', lang)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center gap-6 pt-2">
            <ChannelBar
              label={channelBarLabel}
              online={displayOnline}
              offline={displayOffline}
            />
            <div className="text-center space-y-0.5 pt-2">
              <div className="text-xs text-muted-foreground">{t('sales.totalRevenue', lang)}</div>
              <div className="text-base font-bold text-foreground">{fmtBaht(displaySales)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Agent Performance Leaderboard ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t('sales.leaderboard', lang)}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('sales.leaderboardSub', lang)}</p>
        </CardHeader>
        <CardContent>
          {agentsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (() => {
            const agents = agentsData ?? []
            const totalSales    = agents.reduce((s, r) => s + r.sales_total, 0)
            const totalOrders   = agents.reduce((s, r) => s + r.order_total, 0)
            const totalCalls    = agents.reduce((s, r) => s + r.call_total, 0)
            const totalConv     = agents.reduce((s, r) => s + r.converted_customers, 0)
            const totalConvRate = totalCalls > 0 ? totalConv / totalCalls : 0
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>{t('common.agent', lang)}</TableHead>
                    <TableHead className="text-right">{t('kpi.hocSales', lang)}</TableHead>
                    <TableHead className="text-right">{t('common.orders', lang)}</TableHead>
                    <TableHead className="text-right">{t('common.calls', lang)}</TableHead>
                    <TableHead className="text-right">{t('common.convRate', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((r, i) => {
                    const convPct = r.conversion_rate * 100
                    const convColor = convPct >= 30 ? 'text-green-600' : convPct >= 15 ? 'text-yellow-600' : 'text-red-500'
                    return (
                      <TableRow key={r.agent}>
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{r.agent}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{formatTHB(r.sales_total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{r.order_total.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{r.call_total.toLocaleString()}</TableCell>
                        <TableCell className={`text-right tabular-nums text-sm font-semibold ${convColor}`}>{convPct.toFixed(1)}%</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-semibold">{t('common.total', lang)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatTHB(totalSales)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{totalOrders.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{totalCalls.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{(totalConvRate * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )
          })()}
        </CardContent>
      </Card>

    </div>
  )
}
