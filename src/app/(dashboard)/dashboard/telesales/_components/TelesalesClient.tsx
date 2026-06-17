'use client'

import { useState, useMemo, useEffect } from 'react'
import type { DateRange } from 'react-day-picker'
import { Phone, PhoneForwarded, UserCheck, Percent } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { TelesalesTrendMiniChart } from '@/components/dashboard/TelesalesTrendMiniChart'
import { SalesFunnelChart } from './SalesFunnelChart'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { fmt, formatPct, colorRate } from '@/lib/formatters'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'
import { useLocalState } from '@/hooks/useLocalState'

// ── Types ─────────────────────────────────────────────────────────────────────
type Summary = {
  total_leads: number
  total_calls: number
  reached: number
  not_reached: number
  interested: number
  interested_converted: number
  interested_not_converted: number
  total_converted: number
  new_converted: number
  repeat_converted: number
  call_status_breakdown: Record<string, number>
}

type AgentRow = {
  agent: string
  total_calls: number
  reached: number
  not_reached: number
  reach_rate: number
  conversion_rate: number
  calls_per_day: number
}

type TierStatusRow = { tier: string; call_status: string; count: number }

type ApiData = {
  summary: Summary
  by_agent: AgentRow[]
  by_tier_status: TierStatusRow[]
  months: string[]
  options: { cmg: string[]; agents: string[] }
}

const STATUS_PALETTE = ['#003DA6', '#60a5fa', '#10b981', '#f59e0b', '#d1d5db'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload ?? {}
  return (
    <div className="min-w-48 rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md space-y-1.5">
      <p className="font-medium">{label}</p>
      <div className="space-y-1">
        {[...payload].reverse().map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm shrink-0" style={{ background: p.fill }} />
              {p.dataKey}
            </span>
            <span className="tabular-nums font-medium">
              {fmt(row[`_n_${p.dataKey}`])}
              <span className="ml-1 text-muted-foreground">({p.value.toFixed(1)}%)</span>
            </span>
          </div>
        ))}
      </div>
      <p className="border-t pt-1.5 text-muted-foreground">Total: {fmt(row._total)}</p>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toLocalDate = (d: Date): string => {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

const monthLastDay = (isoFirst: string): string => {
  const [y, m] = isoFirst.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
}


// ── Component ─────────────────────────────────────────────────────────────────
export function TelesalesClient() {
  const { lang } = useLanguage()
  // ── Date range ────────────────────────────────────────────────────────────────
  const [rangeFrom,   setRangeFrom]   = useLocalState<string | null>('tele:month:from', null)
  const [rangeTo,     setRangeTo]     = useLocalState<string | null>('tele:month:to', null)
  const [hoverMonth,  setHoverMonth]  = useState<string | null>(null)
  const [filterMode,  setFilterMode]  = useState<'chips' | 'custom'>('chips')
  const [customRange, setCustomRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [calOpen,     setCalOpen]     = useState(false)

  const clearCustom = () => {
    setFilterMode('chips')
    setCustomRange({ from: undefined, to: undefined })
  }

  const customLabel = (() => {
    const f = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    if (!customRange.from) return 'Custom Range'
    return customRange.to ? `${f(customRange.from)} – ${f(customRange.to)}` : f(customRange.from)
  })()

  const effectiveStart = useMemo((): string | null => {
    if (filterMode === 'custom') return customRange.from ? toLocalDate(customRange.from) : null
    return rangeFrom ? `${rangeFrom}-01` : null
  }, [filterMode, customRange.from, rangeFrom])

  const effectiveEnd = useMemo((): string | null => {
    if (filterMode === 'custom') {
      const d = customRange.to ?? customRange.from
      return d ? toLocalDate(d) : null
    }
    if (!rangeFrom) return null
    return monthLastDay(`${rangeTo ?? rangeFrom}-01`)
  }, [filterMode, customRange, rangeFrom, rangeTo])

  const handleChipClick = (m: string) => {
    if (filterMode === 'custom') setFilterMode('chips')
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

  // ── Attribute filters ─────────────────────────────────────────────────────────
  const [cmg,   setCmg]   = useLocalState<string[]>('tele:cmg', [])
  const [agent, setAgent] = useLocalState<string[]>('tele:agent', [])

  const hasFilter = cmg.length > 0 || agent.length > 0
  const clearAll  = () => { setCmg([]); setAgent([]) }

  // ── Query string ──────────────────────────────────────────────────────────────
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart)   p.set('startDate', effectiveStart)
    if (effectiveEnd)     p.set('endDate',   effectiveEnd)
    if (cmg.length > 0)   p.set('cmg',       cmg.join(','))
    if (agent.length > 0) p.set('agent',     agent.join(','))
    return p.toString()
  }, [effectiveStart, effectiveEnd, cmg, agent])

  const { data, isLoading, error } = useDashboardSWR<ApiData>(
    `/api/data/dashboard/telesales${qs ? `?${qs}` : ''}`
  )

  const months = useMemo(
    () => (data?.months ?? []).map(m => m.substring(0, 7)),
    [data?.months]
  )

  useEffect(() => {
    if (months.length > 0 && rangeFrom === null && rangeTo === null) {
      setRangeFrom(months[0])
      setRangeTo(months[months.length - 1])
    }
  }, [months, rangeFrom, rangeTo])

  // ── Render ────────────────────────────────────────────────────────────────────
  if (isLoading && !data) return <PageLoading cols={4} />
  if (error)              return <PageError message={error.message} />
  if (!data)              return <PageEmpty message={t('common.noData', lang)} hint={t('common.buildFirst', lang)} />

  const { summary, by_agent, by_tier_status, options } = data
  const cmgOptions   = options.cmg.map(c => ({ value: c, label: c }))
  const agentOptions = options.agents.map(a => ({ value: a, label: a }))

  const interested             = summary.interested ?? 0
  const reachRate              = summary.total_calls > 0 ? summary.reached / summary.total_calls : 0
  const convRate               = summary.reached > 0 ? summary.total_converted / summary.reached : 0

  // ── Call status 100% stacked bar data ────────────────────────────────────────
  // Find top 4 statuses by total count across all tiers
  const statusTotals: Record<string, number> = {}
  ;(by_tier_status ?? []).forEach(r => {
    statusTotals[r.call_status] = (statusTotals[r.call_status] || 0) + r.count
  })
  const top4 = Object.entries(statusTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([s]) => s)
  const stackKeys = [...top4, 'Other']

  // Build per-tier rows normalised to 100%
  const tierMap: Record<string, Record<string, number>> = {}
  ;(by_tier_status ?? []).forEach(r => {
    if (!tierMap[r.tier]) tierMap[r.tier] = {}
    const key = top4.includes(r.call_status) ? r.call_status : 'Other'
    tierMap[r.tier][key] = (tierMap[r.tier][key] || 0) + r.count
  })
  const statusChartData = Object.entries(tierMap)
    .sort(([a], [b]) => a.localeCompare(b, 'th'))
    .map(([tier, counts]) => {
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = { tier, _total: total }
      stackKeys.forEach(k => {
        row[k]          = total > 0 ? Math.round(((counts[k] || 0) / total) * 1000) / 10 : 0
        row[`_n_${k}`]  = counts[k] || 0
      })
      return row
    })

  return (
    <div className="space-y-6">

      {/* ── Filter panel ──────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 rounded-lg border bg-muted/20 px-4 py-3">

        {/* Row 1: Month chips */}
        <div className="flex items-start gap-3">
          <span className="mt-1.5 w-12 shrink-0 text-xs text-muted-foreground">Month</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {filterMode === 'chips' && months.length > 0 && (
              <MonthChipGroup
                months={months}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                hoverMonth={hoverMonth}
                onChipClick={handleChipClick}
                onMouseEnter={m => setHoverMonth(m)}
                onMouseLeave={() => setHoverMonth(null)}
              />
            )}

            {filterMode === 'custom' && (
              <span className="flex items-center gap-1 rounded-full border border-[#003DA6]/40 bg-[#003DA6]/10 px-3.5 py-1.5 text-xs font-semibold text-[#003DA6]">
                {customLabel}
                <button onClick={clearCustom} className="ml-1 opacity-60 hover:opacity-100 hover:text-red-500" aria-label="Clear custom range">×</button>
              </span>
            )}

            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => {
                    if (filterMode === 'chips' && effectiveStart) {
                      const p = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
                      setCustomRange({ from: p(effectiveStart), to: effectiveEnd ? p(effectiveEnd) : undefined })
                    }
                    setFilterMode('custom')
                  }}
                  className={[
                    'select-none rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all',
                    filterMode === 'custom'
                      ? 'border-[#003DA6] bg-[#003DA6] text-white shadow-sm'
                      : 'border-gray-200 bg-background text-muted-foreground hover:bg-gray-50 hover:text-foreground',
                  ].join(' ')}
                >
                  Custom
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0" sideOffset={8}>
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={r => {
                    setCustomRange(r ?? { from: undefined, to: undefined })
                    if (r?.from && r?.to) setCalOpen(false)
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Row 2: Attribute filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground">Filters</span>
          {cmgOptions.length > 0 && (
            <MultiSelect label={t('common.allSegments', lang)} value={cmg} onChange={setCmg} options={cmgOptions} />
          )}
          {agentOptions.length > 0 && (
            <MultiSelect label={t('common.allAgents', lang)} value={agent} onChange={setAgent} options={agentOptions} />
          )}
          {hasFilter && (
            <button onClick={clearAll} className="text-xs text-muted-foreground underline hover:text-foreground">
              {t('common.resetFilters', lang)}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <KpiGrid cols={4}>
        <KpiCard
          title={t('kpi.totalCalls', lang)}
          value={fmt(summary.total_calls)}
          icon={Phone}
          subtitle={`${fmt(summary.total_leads)} leads total`}
        />
        <KpiCard
          title={t('telesales.reachRate', lang)}
          value={summary.total_calls > 0 ? formatPct(reachRate) : '—'}
          icon={PhoneForwarded}
          valueClassName={colorRate(reachRate, [0.6, 0.4])}
          subtitle={`${fmt(summary.reached)} reached · ${fmt(summary.not_reached)} not reached`}
        />
        <KpiCard
          title={t('telesales.convRate', lang)}
          value={summary.reached > 0 ? formatPct(convRate) : '—'}
          icon={Percent}
          valueClassName={colorRate(convRate, [0.3, 0.15])}
          subtitle={`of ${fmt(summary.reached)} reached customers`}
        />
        <KpiCard
          title="Converted"
          value={fmt(summary.total_converted)}
          icon={UserCheck}
          subtitle={`${fmt(summary.new_converted)} new · ${fmt(summary.repeat_converted)} repeat`}
        />
      </KpiGrid>

      {/* ── Calling Trend ─────────────────────────────────────────────────────── */}
      <TelesalesTrendMiniChart
        effectiveStart={effectiveStart}
        effectiveEnd={effectiveEnd}
      />

      {/* ── Call Status by Tier (100% Stacked Horizontal Bar) ────────────────── */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Call Status by Tier</h3>
            <p className="text-xs text-muted-foreground mt-0.5">100% stacked · top 4 statuses + other</p>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {stackKeys.map((k, i) => (
              <span key={k} className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_PALETTE[i] }} />
                {k}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={statusChartData.length * 44 + 24}>
          <BarChart
            layout="vertical"
            data={statusChartData}
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barSize={20}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={v => `${Math.round(v)}%`}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="tier"
              width={90}
              tick={{ fontSize: 12, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<StatusTooltip />} cursor={{ fill: '#f9fafb' }} />
            {stackKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="s"
                fill={STATUS_PALETTE[i]}
                radius={i === 0 ? [4, 0, 0, 4] : i === stackKeys.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Conversion Funnel ─────────────────────────────────────────────────── */}
      <SalesFunnelChart
        title="Conversion Funnel"
        stages={[
          {
            label: 'Total Calls',
            value: summary.total_calls,
            description: 'Total unique customers contacted by telesales in the selected period (filtered by first_connected_date).',
          },
          {
            label: 'Reached',
            value: summary.reached,
            description: 'Customers who answered and had a conversation. Excludes only truly unreachable outcomes: "ไม่รับสาย" (no answer) and "ปิดเครื่อง/ติดต่อไม่ได้" (phone off). "Not convenient" and "not interested yet" still count as Reached.',
          },
          {
            label: 'Interested',
            value: interested,
            description: 'Reached customers who did not explicitly decline. Excludes "ไม่สะดวกคุย" (not convenient) and "ยังไม่ต้องการสินค้า" (not ready to buy) — these customers answered but were not ready to purchase.',
          },
          {
            label: 'Converted',
            value: summary.total_converted,
            description: 'Customers with a HOC purchase attributed to telesales (within the attribution window). When a date range is selected, only orders placed on or after the customer\'s recorded call date are counted.',
          },
        ]}
      />

      {/* Drop-off stats */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-card px-4 py-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Not Reached</p>
          <p className="text-sm font-semibold tabular-nums text-red-500">{fmt(summary.not_reached)}</p>
          <p className="text-xs text-muted-foreground">
            {summary.total_calls > 0 ? formatPct(summary.not_reached / summary.total_calls) : '—'} drop-off
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Reached, Not Interested</p>
          <p className="text-sm font-semibold tabular-nums text-amber-500">
            {fmt(summary.reached - interested)}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.reached > 0 ? formatPct((summary.reached - interested) / summary.reached) : '—'} drop-off
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Interested, Not Converted</p>
          <p className="text-sm font-semibold tabular-nums text-amber-500">
            {fmt(summary.interested_not_converted)}
          </p>
          <p className="text-xs text-muted-foreground">
            {interested > 0 ? formatPct(summary.interested_not_converted / interested) : '—'} drop-off
          </p>
        </div>
      </div>

      {/* ── Agent Leaderboard ─────────────────────────────────────────────────── */}
      {by_agent.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h3 className="text-sm font-semibold">{t('sales.leaderboard', lang)}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Ranked by total calls</p>
            </div>
            <span className="text-xs text-muted-foreground">{by_agent.length} agents</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center px-3">#</TableHead>
                <TableHead>{t('common.agent', lang)}</TableHead>
                <TableHead className="text-right">Total Calls</TableHead>
                <TableHead className="text-right">Reached</TableHead>
                <TableHead className="text-right">Not Reached</TableHead>
                <TableHead className="text-right">Reach Rate</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right pr-4">Calls/Day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {by_agent.map((row, i) => (
                <TableRow key={row.agent}>
                  <TableCell className="text-center px-3 text-xs text-muted-foreground tabular-nums">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.agent}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmt(row.total_calls)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(row.reached)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(row.not_reached)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-sm font-medium ${colorRate(row.reach_rate, [0.6, 0.4])}`}>
                    {formatPct(row.reach_rate)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums text-sm font-medium ${colorRate(row.conversion_rate, [0.3, 0.15])}`}>
                    {row.reached > 0 ? formatPct(row.conversion_rate) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground pr-4">
                    {row.calls_per_day.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
              {(() => {
                const sumCalls      = by_agent.reduce((s, r) => s + r.total_calls, 0)
                const sumReached    = by_agent.reduce((s, r) => s + r.reached, 0)
                const sumNotReached = by_agent.reduce((s, r) => s + r.not_reached, 0)
                const sumConverted  = by_agent.reduce((s, r) => s + r.conversion_rate * r.reached, 0)
                const totalReachRate = sumCalls > 0 ? sumReached / sumCalls : 0
                const totalConvRate  = sumReached > 0 ? sumConverted / sumReached : 0
                return (
                  <TableRow className="border-t-2 bg-muted/40 font-semibold">
                    <TableCell className="text-center px-3 text-xs text-muted-foreground">Σ</TableCell>
                    <TableCell className="text-sm">Total</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{fmt(sumCalls)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(sumReached)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(sumNotReached)}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm font-semibold ${colorRate(totalReachRate, [0.6, 0.4])}`}>
                      {formatPct(totalReachRate)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums text-sm font-semibold ${colorRate(totalConvRate, [0.3, 0.15])}`}>
                      {sumReached > 0 ? formatPct(totalConvRate) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground pr-4">—</TableCell>
                  </TableRow>
                )
              })()}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  )
}
