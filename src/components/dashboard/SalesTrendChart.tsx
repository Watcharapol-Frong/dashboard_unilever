'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  ComposedChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList, ResponsiveContainer,
} from 'recharts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useBuild }        from '@/context/BuildContext'
import { fmtBaht }         from '@/lib/formatters'

// ── Types ──────────────────────────────────────────────────────────────────────
type TrendRow = { period: string; online_sales: number; offline_sales: number; target: number; roi?: number }
type View     = 'monthly' | 'weekly'

// ── Helpers ────────────────────────────────────────────────────────────────────
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 500_000 === 0 ? 0 : 1)}M`
  : n >= 1_000   ? `${Math.round(n / 1_000)}K`
  : `${Math.round(n)}`

const axisLabel = (n: number) => {
  if (n === 0) return '฿0'
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `฿${Math.round(n / 1_000)}K`
  return `฿${n}`
}

const periodLabel = (iso: string, view: View) => {
  const [y, m, d] = iso.split('-').map(Number)
  return view === 'monthly'
    ? new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    : new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  const entry:  TrendRow = payload[0]?.payload ?? {}
  const online  = entry.online_sales  ?? 0
  const offline = entry.offline_sales ?? 0
  const target  = entry.target        ?? 0
  const roi     = entry.roi           ?? 0
  const total   = online + offline
  const ach     = target > 0 ? (total / target) * 100 : null
  const achColor = ach === null ? '' : ach >= 100 ? 'text-green-600' : ach >= 80 ? 'text-yellow-600' : 'text-red-500'

  return (
    <div className="min-w-52 rounded-lg border bg-background px-3.5 py-3 text-xs shadow-md space-y-2.5">
      {/* Period */}
      <p className="text-muted-foreground">{label}</p>

      {/* Total sales — prominent */}
      <p className="text-base font-bold tabular-nums leading-none">{fmtBaht(total)}</p>

      {/* Channel breakdown */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-8">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm bg-[#003DA6]" />Online
          </span>
          <span className="tabular-nums">{fmtBaht(online)}</span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm bg-[#60a5fa]" />Offline
          </span>
          <span className="tabular-nums">{fmtBaht(offline)}</span>
        </div>
      </div>

      {/* Target + ROI */}
      <div className="space-y-1.5 border-t pt-2">
        <div className="flex items-center justify-between gap-8">
          <span className="text-muted-foreground">Target</span>
          <span className="tabular-nums">
            {fmtBaht(target)}
            {ach !== null && (
              <span className={`ml-1.5 ${achColor}`}>({ach.toFixed(1)}%)</span>
            )}
          </span>
        </div>
        {roi > 0 && (
          <div className="flex items-center justify-between gap-8">
            <span className="text-muted-foreground">ROI</span>
            <span className="tabular-nums">{roi.toFixed(1)}×</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Legend items ──────────────────────────────────────────────────────────────
const LEGEND = [
  { color: '#003DA6', label: 'Online',  type: 'square' },
  { color: '#60a5fa', label: 'Offline', type: 'square' },
  { color: '#d1d5db', label: 'Target',  type: 'square' },
] as const

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  cmgFilter:      string[]
  effectiveStart: string | null   // YYYY-MM-DD from page filter
  effectiveEnd:   string | null   // YYYY-MM-DD from page filter
}

export function SalesTrendChart({ cmgFilter, effectiveStart, effectiveEnd }: Props) {
  const [view, setView] = useState<View>('weekly')
  const { buildVersion } = useBuild()

  const cmgQuery = cmgFilter.length > 0
    ? `&cmg=${cmgFilter.map(encodeURIComponent).join(',')}`
    : ''

  // ── Monthly data — always fetched, filtered client-side by page range ─────────
  const { data: monthlyData } = useDashboardSWR<TrendRow[]>(
    `/api/data/dashboard/sales-trend?view=monthly${cmgQuery}`,
  )

  const filteredMonthlyData = useMemo(() => {
    if (!monthlyData) return []
    if (!effectiveStart || !effectiveEnd) return monthlyData
    return monthlyData.filter(d => {
      const [y, m] = d.period.split('-').map(Number)
      const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
      return d.period <= effectiveEnd && monthEnd >= effectiveStart
    })
  }, [monthlyData, effectiveStart, effectiveEnd])

  // ── Weekly data — uses effectiveStart/End directly (null key = disabled) ──────
  const weeklyKey = view === 'weekly' && effectiveStart && effectiveEnd
    ? [`/api/data/dashboard/sales-trend?view=weekly&start=${effectiveStart}&end=${effectiveEnd}${cmgQuery}`, buildVersion]
    : null

  const { data: weeklyData } = useSWR<{ ok: boolean; data: TrendRow[] }>(
    weeklyKey,
    async ([url]: [string]) => fetch(url).then(r => r.json()),
    { keepPreviousData: true, revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300_000 },
  )

  // ── Chart data ────────────────────────────────────────────────────────────────
  const rawData    = view === 'monthly' ? filteredMonthlyData : (weeklyData?.data ?? [])
  const showLabels = view === 'monthly'

  const chartData = useMemo(() => rawData.map(d => ({
    ...d,
    _label:       periodLabel(d.period, view),
    _total_sales: d.online_sales + d.offline_sales,
  })), [rawData, view])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border bg-card px-4 pb-4 pt-3">

      {/* Row 1: Title + Legend */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Sales Trend</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {LEGEND.map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Row 2: Controls (right-aligned) */}
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
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
            data={chartData}
            margin={{ top: 24, right: 8, left: 0, bottom: 0 }}
            barGap={1}
            barCategoryGap="32%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={axisLabel}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />

            {/* Stacked Sales — Online (bottom) */}
            <Bar stackId="s" dataKey="online_sales" name="Online" fill="#003DA6" maxBarSize={44} radius={[0, 0, 2, 2]} />

            {/* Stacked Sales — Offline (top) with data labels */}
            <Bar stackId="s" dataKey="offline_sales" name="Offline" fill="#60a5fa" maxBarSize={44} radius={[4, 4, 0, 0]}>
              {showLabels && (
                <LabelList
                  dataKey="_total_sales"
                  position="top"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={(props: any) => {
                    const { x, y, width, index } = props
                    const total = chartData[index as number]?._total_sales ?? 0
                    if (!total) return null
                    return (
                      <text
                        x={(x as number) + (width as number) / 2}
                        y={(y as number) - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#6b7280"
                      >
                        {compact(total)}
                      </text>
                    )
                  }}
                />
              )}
            </Bar>

            {/* Target bar — monthly view only */}
            {view === 'monthly' && (
              <Bar dataKey="target" name="Target" fill="#e5e7eb" maxBarSize={44} radius={[4, 4, 2, 2]} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
