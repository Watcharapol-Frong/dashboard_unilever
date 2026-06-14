'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useBuild }        from '@/context/BuildContext'
import { formatPct }       from '@/lib/formatters'

type View = 'monthly' | 'weekly'

interface TrendRow {
  period:      string
  total_calls: number
  reached:     number
  converted:   number
}

interface Props {
  effectiveStart: string | null
  effectiveEnd:   string | null
}

const LEGEND = [
  { color: '#003DA6', label: 'Calls' },
  { color: '#60a5fa', label: 'Reached' },
  { color: '#10b981', label: 'Converted' },
] as const

const TOOLTIP_STYLE = {
  background: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  fontSize: 12,
} as const

function periodLabel(iso: string, view: View) {
  const [y, m, d] = iso.split('-').map(Number)
  return view === 'monthly'
    ? new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    : new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function monthEnd(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row: TrendRow = payload[0]?.payload ?? {}
  const rate = row.reached > 0 ? row.converted / row.reached : 0
  return (
    <div className="min-w-44 rounded-lg border bg-background px-3.5 py-3 text-xs shadow-md space-y-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{row.total_calls.toLocaleString()} calls</p>
      <div className="space-y-1 border-t pt-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Reached</span>
          <span className="tabular-nums">{row.reached.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Converted</span>
          <span className="tabular-nums">{row.converted.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Conv. Rate</span>
          <span className="tabular-nums">{formatPct(rate)}</span>
        </div>
      </div>
    </div>
  )
}

export function TelesalesTrendMiniChart({ effectiveStart, effectiveEnd }: Props) {
  const [view, setView] = useState<View>('weekly')
  const { buildVersion } = useBuild()

  // Monthly — all time, filtered client-side
  const { data: monthlyData } = useDashboardSWR<TrendRow[]>(
    '/api/data/dashboard/telesales-trend?view=monthly',
  )

  const filteredMonthlyData = useMemo(() => {
    if (!monthlyData) return []
    if (!effectiveStart || !effectiveEnd) return monthlyData
    return monthlyData.filter(d =>
      d.period <= effectiveEnd && monthEnd(d.period) >= effectiveStart,
    )
  }, [monthlyData, effectiveStart, effectiveEnd])

  // Weekly — only when a date range is selected
  const weeklyKey = view === 'weekly' && effectiveStart && effectiveEnd
    ? [`/api/data/dashboard/telesales-trend?view=weekly&start=${effectiveStart}&end=${effectiveEnd}`, buildVersion]
    : null

  const { data: weeklyData } = useSWR<{ ok: boolean; data: TrendRow[] }>(
    weeklyKey,
    async ([url]: [string]) => fetch(url).then(r => r.json()),
    { keepPreviousData: true, revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300_000 },
  )

  const rawData = view === 'monthly' ? filteredMonthlyData : (weeklyData?.data ?? [])

  const chartData = useMemo(() =>
    rawData.map(d => ({
      ...d,
      _label: periodLabel(d.period, view),
      _rate:  d.reached > 0 ? parseFloat(((d.converted / d.reached) * 100).toFixed(1)) : 0,
    })),
  [rawData, view])

  return (
    <div className="rounded-lg border bg-card px-4 pb-4 pt-3">

      {/* Row 1: Title + Legend */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Telesales Trend</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {LEGEND.map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#f59e0b]" />Conv. Rate
          </span>
        </div>
      </div>

      {/* Row 2: Controls (right-aligned, same as SalesTrendChart) */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={v => v && setView(v as View)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="monthly" className="h-7 px-3 text-xs">Monthly</ToggleGroupItem>
          <ToggleGroupItem value="weekly"  className="h-7 px-3 text-xs">Weekly</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Chart */}
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }} barGap={2} barCategoryGap="32%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
            <Bar yAxisId="left" dataKey="total_calls" name="Calls"     fill="#003DA6" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.75} />
            <Bar yAxisId="left" dataKey="reached"     name="Reached"   fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="converted"   name="Converted" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="_rate"
              name="Conv. Rate"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: '#f59e0b' }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
