'use client'

import { useState, useMemo } from 'react'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'

// ── Types ─────────────────────────────────────────────────────────────────────

type TrendRow = {
  period: string
  period_label: string
  new_customer: number
  retention: number
  first_order_not_converted: number
  retention_not_converted: number
}

type Interval = 'monthly' | 'weekly' | 'custom'
type Conversion = 'all' | 'converted' | 'not_converted'

// ── Chart Config ──────────────────────────────────────────────────────────────

const chartConfig = {
  new_customer:               { label: 'New Customer',              color: '#10b981' },
  retention:                  { label: 'Retention',                 color: '#0d9488' },
  first_order_not_converted:  { label: 'First Order (Not Conv.)',   color: '#3b82f6' },
  retention_not_converted:    { label: 'Retention (Not Conv.)',     color: '#94a3b8' },
} satisfies ChartConfig

const BAR_SIZE: Record<string, number> = { daily: 10, weekly: 22, monthly: 44 }

// ── Bar label renderer ────────────────────────────────────────────────────────

const renderBarLabel = (color: string) => (props: any) => {
  const { x, y, width, height, value } = props
  if (!value || value < 1) return null
  const formatted = value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      fill={color}
      textAnchor="middle"
      dominantBaseline="middle"
      className="text-[9px] font-extrabold select-none pointer-events-none"
    >
      {formatted}
    </text>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label, visibleSeries }: {
  active?: boolean
  payload?: any[]
  label?: string
  visibleSeries: string[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as TrendRow

  const allRows: { key: keyof TrendRow; color: string; label: string }[] = [
    { key: 'new_customer',              color: '#10b981', label: 'New Customer' },
    { key: 'retention',                 color: '#0d9488', label: 'Retention' },
    { key: 'first_order_not_converted', color: '#3b82f6', label: 'First Order (Not Conv.)' },
    { key: 'retention_not_converted',   color: '#94a3b8', label: 'Retention (Not Conv.)' },
  ]
  const rows = allRows.filter(r => visibleSeries.includes(r.key))

  const total = rows.reduce((sum, r) => sum + (Number(d[r.key]) || 0), 0)

  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[14rem] space-y-2">
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="space-y-0.5">
        <div className="text-[10px] text-muted-foreground">Total Customers</div>
        <div className="text-base font-bold text-foreground">{total.toLocaleString()}</div>
      </div>
      <div className="space-y-1.5 pt-1">
        {rows.map(r => (
          <div key={r.key} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: r.color }} />
              <span>{r.label}</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {(Number(d[r.key]) || 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface CustomerTrendChartProps {
  filterCmg?: string[]
  filterChannel?: string
  startDate?: string | null
  endDate?: string | null
}

export function CustomerTrendChart({ filterCmg = [], filterChannel = 'all', startDate, endDate }: CustomerTrendChartProps) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const [customStart, setCustomStart] = useState('2026-02-01')
  const [customEnd, setCustomEnd] = useState('2026-05-31')
  const [conversion, setConversion] = useState<Conversion>('all')

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(
      Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000
    )
  }, [interval, customStart, customEnd])

  const calculatedInterval = useMemo<'daily' | 'weekly' | 'monthly'>(() => {
    if (interval !== 'custom') return interval
    return durationDays <= 32 ? 'daily' : 'weekly'
  }, [interval, durationDays])

  const apiUrl = useMemo(() => {
    let url = `/api/data/telesales/customer-trend?interval=${calculatedInterval}`
    if (interval === 'custom') {
      if (customStart) url += `&startDate=${customStart}`
      if (customEnd)   url += `&endDate=${customEnd}`
    } else {
      if (startDate) url += `&startDate=${startDate}`
      if (endDate)   url += `&endDate=${endDate}`
    }
    if (filterCmg.length > 0)  url += `&cmg=${filterCmg.join(',')}`
    if (filterChannel !== 'all') url += `&channel=${filterChannel}`
    return url
  }, [calculatedInterval, interval, customStart, customEnd, filterCmg, filterChannel, startDate, endDate])

  const { data = [], isLoading, isValidating } = useDashboardSWR<TrendRow[]>(apiUrl)

  const visibleSeries = useMemo<string[]>(() => {
    if (conversion === 'converted')     return ['new_customer', 'retention']
    if (conversion === 'not_converted') return ['first_order_not_converted', 'retention_not_converted']
    return ['new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted']
  }, [conversion])

  const barSize = BAR_SIZE[calculatedInterval] ?? BAR_SIZE.monthly

  return (
    <Card className="w-full py-6 gap-8 shadow-xs border">
      <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-start items-start gap-4 px-6 pb-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-medium">New & Reactivated Customers Trend</CardTitle>
            {isValidating && !isLoading && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full animate-pulse">
                Updating…
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Customer acquisition and retention breakdown — converted vs. not converted, by period.
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          {/* Conversion filter */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={conversion} onValueChange={v => setConversion(v as Conversion)}>
                    <SelectTrigger className="h-7 text-xs w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      <SelectItem value="converted">Converted Only</SelectItem>
                      <SelectItem value="not_converted">Not Converted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                {conversion === 'converted'
                  ? 'Showing customers who ordered within the attribution window (New + Retention).'
                  : conversion === 'not_converted'
                  ? 'Showing customers who were called but did not order within the attribution window.'
                  : 'Showing all customer types — both converted and not converted.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Interval tabs */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
              {(['monthly', 'weekly', 'custom'] as const).map(v => {
                const tipText =
                  v === 'monthly' ? 'Group data by calendar month'
                  : v === 'weekly' ? 'Group data by ISO week (Mon–Sun)'
                  : 'Select a custom date range — overrides the Overview date filter'
                return (
                  <Tooltip key={v}>
                    <TooltipTrigger asChild>
                      <button
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
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{tipText}</TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>

          {/* Custom date picker */}
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

          {/* Legend */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 flex-wrap">
              {visibleSeries.includes('new_customer') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div><LegendDot color="#10b981" label="New" /></div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                    First-time customers who ordered within the attribution window.
                  </TooltipContent>
                </Tooltip>
              )}
              {visibleSeries.includes('retention') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div><LegendDot color="#0d9488" label="Retention" /></div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                    Returning customers who reordered within the attribution window.
                  </TooltipContent>
                </Tooltip>
              )}
              {visibleSeries.includes('first_order_not_converted') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div><LegendDot color="#3b82f6" label="First (Not Conv.)" /></div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                    First-time customers whose order fell outside the attribution window.
                  </TooltipContent>
                </Tooltip>
              )}
              {visibleSeries.includes('retention_not_converted') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div><LegendDot color="#94a3b8" label="Repeat (Not Conv.)" /></div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                    Returning customers whose reorder fell outside the attribution window.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="px-6 pt-4">
        {isLoading ? (
          <Skeleton className="h-[350px] w-full rounded-xl" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ComposedChart data={data} margin={{ left: 10, right: 10, top: 15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144, 164, 174, 0.3)" />
              <XAxis dataKey="period_label" tickLine={false} tickMargin={10} axisLine={false} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                fontSize={11}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <ChartTooltip
                cursor={false}
                content={props => (
                  <TrendTooltip {...props} visibleSeries={visibleSeries} />
                )}
              />
              {visibleSeries.includes('new_customer') && (
                <Bar dataKey="new_customer" fill="#10b981" stackId="t" barSize={barSize} />
              )}
              {visibleSeries.includes('retention') && (
                <Bar dataKey="retention" fill="#0d9488" stackId="t" barSize={barSize} />
              )}
              {visibleSeries.includes('first_order_not_converted') && (
                <Bar dataKey="first_order_not_converted" fill="#3b82f6" stackId="t" barSize={barSize} />
              )}
              {visibleSeries.includes('retention_not_converted') && (
                <Bar
                  dataKey="retention_not_converted"
                  fill="#94a3b8"
                  stackId="t"
                  barSize={barSize}
                  radius={[4, 4, 0, 0]}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Legend dot helper ─────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  )
}
