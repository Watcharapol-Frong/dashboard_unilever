'use client'

import { useState, useMemo } from 'react'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
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

type Interval = 'monthly' | 'weekly' | 'daily'
type Conversion = 'all' | 'converted' | 'not_converted'

// ── Chart Config ──────────────────────────────────────────────────────────────

const chartConfig = {
  new_customer:               { label: 'New Customer',              color: '#10b981' },
  retention:                  { label: 'Retention',                 color: '#0d9488' },
  first_order_not_converted:  { label: 'First Order (Not Conv.)',   color: '#3b82f6' },
  retention_not_converted:    { label: 'Retention (Not Conv.)',     color: '#94a3b8' },
} satisfies ChartConfig

const BAR_SIZE: Record<string, number> = { daily: 10, weekly: 22, monthly: 44 }

const SERIES_META: Record<string, { color: string; label: string }> = {
  new_customer:               { color: '#10b981', label: 'New Customer' },
  retention:                  { color: '#0d9488', label: 'Retention' },
  first_order_not_converted:  { color: '#3b82f6', label: 'First Order (Not Conv.)' },
  retention_not_converted:    { color: '#94a3b8', label: 'Retention (Not Conv.)' },
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

  const rows = visibleSeries
    .map(key => ({ key: key as keyof TrendRow, ...SERIES_META[key] }))
    .filter(r => r.color)

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

// ── Legend Dot ────────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  )
}

// ── Legend Tooltip descriptions ───────────────────────────────────────────────

const LEGEND_TIPS: Record<string, { label: string; tip: string }> = {
  new_customer: {
    label: 'New',
    tip: 'First-time customers who ordered within the attribution window.',
  },
  retention: {
    label: 'Retention',
    tip: 'Returning customers who reordered within the attribution window.',
  },
  first_order_not_converted: {
    label: 'First (Not Conv.)',
    tip: 'First-time customers whose order fell outside the attribution window.',
  },
  retention_not_converted: {
    label: 'Repeat (Not Conv.)',
    tip: 'Returning customers whose reorder fell outside the attribution window.',
  },
}

const INTERVAL_TIPS: Record<string, string> = {
  monthly: 'Group data by calendar month',
  weekly:  'Group data by ISO week (Mon–Sun)',
  daily:   'Show daily data — follows the date range selected in the main filter above',
}

const CONVERSION_TIPS: Record<Conversion, string> = {
  all:           'Showing all customer types — both converted and not converted.',
  converted:     'Customers who ordered within the attribution window (New + Retention).',
  not_converted: 'Customers who were called but did not order within the attribution window.',
}

// ── Series order ──────────────────────────────────────────────────────────────

const ALL_SERIES: Record<Conversion, string[]> = {
  converted:     ['new_customer', 'retention'],
  not_converted: ['first_order_not_converted', 'retention_not_converted'],
  all:           ['new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted'],
}

// ── Main Component ────────────────────────────────────────────────────────────

interface CustomerTrendChartProps {
  filterCmg?: string[]
  filterChannel?: string
  startDate?: string | null
  endDate?: string | null
}

export function CustomerTrendChart({
  filterCmg = [],
  filterChannel = 'all',
  startDate,
  endDate,
}: CustomerTrendChartProps) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const [conversion, setConversion] = useState<Conversion>('all')

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ interval })
    if (startDate) params.set('startDate', startDate)
    if (endDate)   params.set('endDate',   endDate)
    if (filterCmg.length > 0)    params.set('cmg',     filterCmg.join(','))
    if (filterChannel !== 'all') params.set('channel', filterChannel)
    return `/api/data/telesales/customer-trend?${params.toString()}`
  }, [interval, filterCmg, filterChannel, startDate, endDate])

  const { data = [], isLoading, isValidating } = useDashboardSWR<TrendRow[]>(apiUrl)

  const visibleSeries = ALL_SERIES[conversion]
  const topSeries     = visibleSeries[visibleSeries.length - 1]
  const barSize       = BAR_SIZE[interval] ?? BAR_SIZE.monthly

  return (
    <Card className="w-full py-6 gap-8 shadow-xs border">
      <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-start items-start gap-4 px-6 pb-2">

        {/* Title */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-medium">New &amp; Reactivated Customers Trend</CardTitle>
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

        {/* Controls */}
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
                {CONVERSION_TIPS[conversion]}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Interval tabs */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center bg-gray-100/80 p-0.5 rounded-lg border border-gray-200">
              {(['monthly', 'weekly', 'daily'] as const).map(v => (
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
                  <TooltipContent side="bottom" className="text-xs">{INTERVAL_TIPS[v]}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>

          {/* Daily hint — show when no date range is selected */}
          {interval === 'daily' && !startDate && (
            <span className="text-[10px] text-muted-foreground bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Select a month range above for focused daily view
            </span>
          )}

          {/* Legend */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-3 flex-wrap">
              {visibleSeries.map(key => {
                const meta = LEGEND_TIPS[key]
                if (!meta) return null
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <div>
                        <LegendDot color={SERIES_META[key].color} label={meta.label} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                      {meta.tip}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
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
                content={props => <TrendTooltip {...props} visibleSeries={visibleSeries} />}
              />
              {visibleSeries.map(key => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={SERIES_META[key].color}
                  stackId="t"
                  barSize={barSize}
                  radius={key === topSeries ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
