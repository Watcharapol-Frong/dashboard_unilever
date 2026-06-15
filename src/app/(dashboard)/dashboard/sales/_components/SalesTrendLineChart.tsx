'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { fmtBaht } from '@/lib/formatters'

type TrendRow = { period: string; online_sales: number; offline_sales: number; target: number }
type View     = 'monthly' | 'weekly'

const axisLabel = (n: number) => {
  if (n === 0) return '0'
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `฿${Math.round(n / 1_000)}K`
  return `฿${n}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d: TrendRow = payload[0]?.payload ?? {}
  const online  = d.online_sales  ?? 0
  const offline = d.offline_sales ?? 0
  const target  = d.target        ?? 0
  const total   = online + offline
  const ach     = target > 0 ? (total / target) * 100 : null
  const achColor = ach === null ? '' : ach >= 100 ? 'text-green-600' : ach >= 80 ? 'text-yellow-600' : 'text-red-500'

  return (
    <div className="min-w-44 rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md space-y-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{fmtBaht(total)}</p>
      <div className="space-y-1 border-t pt-1.5">
        <div className="flex justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-[#003DA6]" />Online
          </span>
          <span className="tabular-nums">{fmtBaht(online)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-[#60a5fa]" />Offline
          </span>
          <span className="tabular-nums">{fmtBaht(offline)}</span>
        </div>
        {target > 0 && (
          <div className="flex justify-between gap-6 border-t pt-1">
            <span className="text-muted-foreground">Target</span>
            <span className="tabular-nums">
              {fmtBaht(target)}
              {ach !== null && (
                <span className={`ml-1.5 ${achColor}`}>({ach.toFixed(1)}%)</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  cmgFilter:      string[]
  effectiveStart: string | null
  effectiveEnd:   string | null
}

export function SalesTrendLineChart({ cmgFilter, effectiveStart, effectiveEnd }: Props) {
  const [view, setView] = useState<View>('weekly')

  const cmgQuery = cmgFilter.length > 0
    ? `&cmg=${cmgFilter.map(encodeURIComponent).join(',')}`
    : ''

  // Monthly — fetch all, filter client-side
  const { data: monthlyData } = useDashboardSWR<TrendRow[]>(
    `/api/data/dashboard/sales-trend?view=monthly${cmgQuery}`
  )

  const filteredMonthly = useMemo(() => {
    if (!monthlyData) return []
    if (!effectiveStart || !effectiveEnd) return monthlyData
    return monthlyData.filter(d => {
      const [y, m] = d.period.split('-').map(Number)
      const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
      return d.period <= effectiveEnd && monthEnd >= effectiveStart
    })
  }, [monthlyData, effectiveStart, effectiveEnd])

  // Weekly — only fetch when tab active + date range set
  const weeklyKey = view === 'weekly' && effectiveStart && effectiveEnd
    ? `/api/data/dashboard/sales-trend?view=weekly&start=${effectiveStart}&end=${effectiveEnd}${cmgQuery}`
    : null

  const { data: weeklyRes } = useSWR<{ ok: boolean; data: TrendRow[] }>(
    weeklyKey,
    (url: string) => fetch(url).then(r => r.json()),
    { keepPreviousData: true, revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300_000 }
  )

  const rawData = view === 'monthly' ? filteredMonthly : (weeklyRes?.data ?? [])

  const chartData = useMemo(() => rawData.map(d => {
    const [y, mo, day] = d.period.split('-').map(Number)
    const label = view === 'monthly'
      ? new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      : new Date(y, mo - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return { ...d, _label: label }
  }), [rawData, view])

  return (
    <div className="rounded-lg border bg-card px-4 pb-4 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sales Trend</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[#003DA6]" />Online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[#60a5fa]" />Offline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[#d1d5db]" style={{ borderTop: '1px dashed #d1d5db' }} />Target
            </span>
          </div>
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
      </div>

      <div className="mt-4">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
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
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="online_sales"
              name="Online"
              stroke="#003DA6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#003DA6', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="offline_sales"
              name="Offline"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            {view === 'monthly' && (
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="#d1d5db"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
