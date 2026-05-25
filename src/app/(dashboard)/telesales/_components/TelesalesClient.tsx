'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatNumber, formatPct, colorRate } from '@/lib/formatters'
import { columns } from '../columns'
import { Calendar, Phone, PhoneCall, UserCheck, Users } from 'lucide-react'
import { TelesalesFunnelChart } from './TelesalesFunnelChart'

function lastDayOfMonth(isoDate: string) {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(y, m, 0).toISOString().split('T')[0]
}

interface AgentPerformance {
  agent: string
  total_calls: number
  reached: number
  not_reached: number
  reach_rate: number
  conversion_rate: number
  calls_per_day: number
}

interface TierStatusItem {
  tier: string
  call_status: string
  count: number
}

interface TelesalesData {
  summary: {
    total_leads: number
    total_calls: number
    reached: number
    not_reached: number
    total_converted: number
    call_status_breakdown: Record<string, number>
  }
  by_agent: AgentPerformance[]
  by_period: { period: string; total_calls: number; converted: number }[]
  by_tier_status: TierStatusItem[]
  months: string[]
  options: {
    cmg: string[]
    agents: string[]
  }
}

// ── Status Colors mapping for Thai statuses ──────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  'สั่งซื้อสินค้าเรียบร้อย': '#10B981',                 // Green
  'สั่งสินค้าอื่นๆ': '#84CC16',                       // Lime
  'เสนอราคาแล้ว อยู่ระหว่างรอการยืนยันคำสั่งซื้อ': '#14B8A6', // Teal
  'นัดหมายติดต่อกลับ': '#F59E0B',                   // Amber
  'ไม่สะดวกคุย': '#3b82f6',                       // Blue
  'ไม่รับสาย 1': '#a78bfa',                       // Purple light
  'ไม่รับสาย 2': '#8b5cf6',                       // Purple medium
  'ไม่รับสาย 3': '#6d28d9',                       // Purple dark
  'ไม่รับสาย': '#6366f1',                         // Indigo
  'ไม่รับสาย/สายว่างแต่ไม่รับ': '#6366f1',          // Indigo
  'ยังไม่ต้องการสินค้า': '#94a3b8',                    // Slate
  'ปิดเครื่อง/ติดต่อไม่ได้': '#ef4444',               // Red
  'สายไม่ว่าง': '#ec4899',                         // Pink
  'เบอร์ผิด/ไม่มีสัญญาน': '#f43f5e',                   // Rose
  'สายว่างไม่มีคนรับ': '#475569',                    // Slate dark
  'เบอร์บ้านไม่มีคนรับ': '#cbd5e1',                  // Slate lighter
  'อื่นๆ': '#64748b',                             // Slate dark for "other"
  'Unspecified': '#64748b',
}

function getStatusColor(status: string, index: number): string {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status]
  const palette = [
    '#003DA6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6',
    '#EF4444', '#3B82F6', '#06B6D4', '#6366F1', '#14B8A6',
    '#F97316', '#84CC16', '#64748B'
  ]
  return palette[index % palette.length]
}

interface TooltipPayloadItem {
  value: string | number
  name: string
  color: string
  payload: Record<string, string | number>
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border p-3 rounded-lg shadow-md space-y-1.5 text-xs">
        <div className="font-semibold text-foreground border-b border-border pb-1 mb-1">{label}</div>
        <div className="space-y-1">
          {payload.map((item, index) => {
            if (!item.value && item.value !== 0) return null
            const countKey = `${item.name}_count`
            const count = Number(item.payload[countKey] ?? 0)
            if (count === 0) return null
            return (
              <div key={index} className="flex items-center justify-between gap-8 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-foreground">{formatNumber(count)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return null
}

export default function TelesalesClient() {
  // Range chip state
  const [rangeFrom,   setRangeFrom]   = useState<string | null>(null)
  const [rangeTo,     setRangeTo]     = useState<string | null>(null)
  const [hoverMonth,  setHoverMonth]  = useState<string | null>(null)

  // Trend interval state
  const [interval,    setInterval]    = useState<'custom' | 'monthly'>('monthly')
  const [customStart, setCustomStart] = useState('2026-05-01')
  const [customEnd,   setCustomEnd]   = useState('2026-05-31')

  // Dimension filters
  const [channel,     setChannel]     = useState<string>('all')
  const [cmg,         setCmg]         = useState<string>('all')
  const [agent,       setAgent]       = useState<string>('all')

  // Chip click handler
  const handleChipClick = (m: string) => {
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

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000)
  }, [interval, customStart, customEnd])

  // Effective dates
  const effectiveStart = rangeFrom ?? (interval === 'custom' ? customStart : null)
  const effectiveEnd   = rangeFrom
    ? lastDayOfMonth(rangeTo ?? rangeFrom)
    : (interval === 'custom' ? customEnd : null)

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart) p.set('startDate', effectiveStart)
    if (effectiveEnd)   p.set('endDate',   effectiveEnd)
    if (channel !== 'all') p.set('channel', channel)
    if (cmg !== 'all')     p.set('cmg', cmg)
    if (agent !== 'all')   p.set('agent', agent)
    return `/api/data/telesales?${p.toString()}`
  }, [effectiveStart, effectiveEnd, channel, cmg, agent])

  const { data, isLoading } = useDashboardSWR<TelesalesData>(apiUrl)

  const trendData = useMemo(() => {
    if (!data?.by_period) return []
    return data.by_period.map(p => ({
      name: new Date(p.period).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      Calls: p.total_calls,
      Conversion: p.converted,
    }))
  }, [data])

  const statusData = useMemo(() => {
    if (!data?.by_tier_status || !data?.summary.call_status_breakdown) {
      return { data: [], statuses: [] }
    }

    // 1. Determine top 4 call statuses by overall count (in Thai)
    const overallBreakdown = data.summary.call_status_breakdown
    const sortedStatuses = Object.entries(overallBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([status]) => status)

    const top4Statuses = sortedStatuses.slice(0, 4)
    const hasOthers = sortedStatuses.length > 4

    // Unique statuses to render as bars (exactly 5 if others exist)
    const uniqueStatuses = [...top4Statuses]
    if (hasOthers) {
      uniqueStatuses.push('อื่นๆ')
    }

    // 2. Group by tier
    const tierMap: Record<string, Record<string, number>> = {}
    data.by_tier_status.forEach(item => {
      const tier = item.tier || 'Unspecified'
      const status = item.call_status || 'Unspecified'
      const isTop4 = top4Statuses.includes(status)
      const mappedStatus = isTop4 ? status : 'อื่นๆ'

      if (!tierMap[tier]) {
        tierMap[tier] = {}
        uniqueStatuses.forEach(s => {
          tierMap[tier][s] = 0
        })
      }
      tierMap[tier][mappedStatus] = (tierMap[tier][mappedStatus] || 0) + item.count
    })

    // 3. Convert to percentages and counts for Recharts
    const result = Object.entries(tierMap).map(([tier, statuses]) => {
      const total = Object.values(statuses).reduce((sum, val) => sum + val, 0)
      const entry: Record<string, string | number> = {
        tier,
        total
      }

      uniqueStatuses.forEach(s => {
        entry[s] = 0
        entry[`${s}_count`] = 0
      })

      if (total > 0) {
        Object.entries(statuses).forEach(([status, count]) => {
          entry[`${status}_count`] = count
          entry[status] = parseFloat(((count / total) * 100).toFixed(2))
        })
      }

      return entry
    })

    return {
      data: result,
      statuses: uniqueStatuses
    }
  }, [data])

  const { data: chartData, statuses: uniqueStatuses } = statusData

  const chartHeight = useMemo(() => {
    if (!chartData || chartData.length === 0) return 400
    return Math.max(400, chartData.length * 45 + 120)
  }, [chartData])

  if (isLoading && !data) return <PageLoading />
  if (!data || data.summary.total_calls === 0) {
    return <PageEmpty message="No telesales data available" hint="Please upload telesales data and build mart." />
  }

  const reachRate = data.summary.total_calls > 0 ? data.summary.reached / data.summary.total_calls : 0
  const conversionRate = data.summary.reached > 0 ? data.summary.total_converted / data.summary.reached : 0

  const hasFilter = channel !== 'all' || cmg !== 'all' || agent !== 'all'
  const hasRange = !!(rangeFrom || (interval === 'custom' && (customStart !== '2026-05-01' || customEnd !== '2026-05-31')))

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
          <div className="space-y-4">
            {/* Row 1: Date & Range Selection */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Month chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {data.months && data.months.map(m => {
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

              {/* Custom Date Range Picker */}
              <div className="flex items-center gap-2">
                <DateRangePicker
                  from={interval === 'custom' ? customStart : ''}
                  to={interval === 'custom' ? customEnd : ''}
                  onFromChange={(start) => {
                    setCustomStart(start)
                    setRangeFrom(null)
                    setRangeTo(null)
                    setInterval('custom')
                  }}
                  onToChange={(end) => {
                    setCustomEnd(end)
                    setRangeFrom(null)
                    setRangeTo(null)
                    setInterval('custom')
                  }}
                />
                {interval === 'custom' && durationDays > 0 && (
                  <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                    daily · {durationDays}d
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <Select value={channel} onValueChange={setChannel}>
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
                  {(data?.options?.cmg || []).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Agents" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {(data?.options?.agents || []).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>

              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel('all')
                    setCmg('all')
                    setAgent('all')
                    setRangeFrom(null)
                    setRangeTo(null)
                    setInterval('monthly')
                    setCustomStart('2026-05-01')
                    setCustomEnd('2026-05-31')
                  }}
                  className="text-xs text-[#003DA6] hover:underline font-semibold"
                >
                  Reset All
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <KpiGrid cols={4}>
        <KpiCard
          title="Total Leads"
          value={formatNumber(data.summary.total_leads)}
          subtitle="Total target leads in database"
          icon={Users}
        />
        <KpiCard
          title="Connected Rate"
          value={formatPct(reachRate)}
          subtitle={`Connected: ${formatNumber(data.summary.reached)} / Total: ${formatNumber(data.summary.total_calls)}`}
          valueClassName={colorRate(reachRate)}
          icon={PhoneCall}
        />
        <KpiCard
          title="Conversion Rate"
          value={formatPct(conversionRate)}
          subtitle={`Converted: ${formatNumber(data.summary.total_converted)} / Connected: ${formatNumber(data.summary.reached)}`}
          valueClassName={colorRate(conversionRate, [0.15, 0.08])}
          icon={UserCheck}
        />
        <KpiCard
          title="Orders (Conversion)"
          value={formatNumber(data.summary.total_converted)}
          subtitle="Total successful orders placed"
          icon={Phone}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Daily Calling Trend (Calls vs Conversion)" height={300} className="lg:col-span-3">
          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorConverted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelClassName="text-xs font-bold" />
            <Area type="monotone" dataKey="Calls" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={2} />
            <Area type="monotone" dataKey="Conversion" stroke="#10b981" fillOpacity={1} fill="url(#colorConverted)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Call Statuses" height={chartHeight} className="lg:col-span-3">
          <BarChart data={chartData} height={chartHeight - 40} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(val) => `${Math.round(val)}%`}
              tickLine={false}
              axisLine={false}
              className={CHART_AXIS_CLS}
            />
            <YAxis
              dataKey="tier"
              type="category"
              tickLine={false}
              axisLine={false}
              className={CHART_AXIS_CLS}
              width={160}
              interval={0}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />
            {uniqueStatuses.map((status, index) => (
              <Bar
                key={status}
                dataKey={status}
                stackId="a"
                fill={getStatusColor(status, index)}
                barSize={20}
              />
            ))}
          </BarChart>
        </ChartCard>
      </div>

      {/* ── Telesales Funnel ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Telesales Conversion Funnel</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lead-to-order journey: All Leads → Contacted → Engaged → Converted
          </p>
        </CardHeader>
        <CardContent>
          <TelesalesFunnelChart
            startDate={effectiveStart ?? ''}
            endDate={effectiveEnd ?? ''}
            channel={channel}
            cmg={cmg}
            agent={agent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Agent Performance Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={data.by_agent} />
        </CardContent>
      </Card>
    </div>
  )
}
