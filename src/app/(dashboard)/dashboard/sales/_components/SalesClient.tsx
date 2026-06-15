'use client'

import { useState, useMemo, useEffect } from 'react'
import type { DateRange } from 'react-day-picker'
import { ShoppingCart, Users, ReceiptText, Repeat2 } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'

import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { SalesTrendLineChart } from './SalesTrendLineChart'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { fmtBaht, fmt, formatPct, colorRate } from '@/lib/formatters'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'
import { useLocalState } from '@/hooks/useLocalState'
import dynamic from 'next/dynamic'
import type { BubbleRecord } from '@/components/charts/SplitBubbleChart'

const SplitBubbleChart = dynamic(
  () => import('@/components/charts/SplitBubbleChart').then(m => ({ default: m.SplitBubbleChart })),
  { ssr: false }
)

// ── Types ─────────────────────────────────────────────────────────────────────
type KpiData = {
  total_sales: number
  total_online: number
  total_offline: number
  total_orders: number
  converted_sales: number
  converted_online: number
  converted_offline: number
  converted_orders: number
  new_customers: number
  retention_customers: number
  not_converted_sales: number
  avg_order_value: number
  cmp_converted_sales: number | null
  comparison_label: string | null
  current_period_label: string | null
}

type ApiData = {
  kpi: KpiData
  options: { cmg: string[]; agents: string[] }
  months: string[]
  by_bubble: BubbleRecord[]
}

type AgentRow = {
  agent: string
  sales_total: number
  order_total: number
  call_total: number
  converted_customers: number
  conversion_rate: number
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
export function SalesClient() {
  const { lang } = useLanguage()
  // ── Date range ────────────────────────────────────────────────────────────────
  const [rangeFrom,   setRangeFrom]   = useLocalState<string | null>('sales:month:from', null)
  const [rangeTo,     setRangeTo]     = useLocalState<string | null>('sales:month:to', null)
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
  const [channel, setChannel] = useLocalState<string>('sales:channel', 'all')
  const [cmg,     setCmg]     = useLocalState<string[]>('sales:cmg', [])
  const [agent,   setAgent]   = useLocalState<string[]>('sales:agent', [])

  const hasFilter = channel !== 'all' || cmg.length > 0 || agent.length > 0

  const clearAll = () => {
    setChannel('all'); setCmg([]); setAgent([])
  }

  // ── Query string ──────────────────────────────────────────────────────────────
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart)    p.set('startDate', effectiveStart)
    if (effectiveEnd)      p.set('endDate',   effectiveEnd)
    if (channel !== 'all') p.set('channel',   channel)
    if (cmg.length > 0)    p.set('cmg',       cmg.join(','))
    if (agent.length > 0)  p.set('agent',     agent.join(','))
    return p.toString()
  }, [effectiveStart, effectiveEnd, channel, cmg, agent])

  const { data, isLoading, error } = useDashboardSWR<ApiData>(
    `/api/data/dashboard/sales${qs ? `?${qs}` : ''}`
  )

  // Agent leaderboard — respects date range + CMG only (same scope as trend chart)
  const agentQs = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart) p.set('startDate', effectiveStart)
    if (effectiveEnd)   p.set('endDate',   effectiveEnd)
    if (cmg.length > 0) p.set('cmg',       cmg.join(','))
    return p.toString()
  }, [effectiveStart, effectiveEnd, cmg])

  const { data: agentRows } = useDashboardSWR<AgentRow[]>(
    `/api/data/dashboard/agents${agentQs ? `?${agentQs}` : ''}`
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

  const { kpi, options, by_bubble } = data
  const cmgOptions   = options.cmg.map(c => ({ value: c, label: c }))
  const agentOptions = options.agents.map(a => ({ value: a, label: a }))

  const totalBuyers  = kpi.new_customers + kpi.retention_customers
  const totalSales   = kpi.total_online + kpi.total_offline
  const onlinePct    = totalSales > 0 ? (kpi.total_online  / totalSales) * 100 : 0
  const offlinePct   = totalSales > 0 ? (kpi.total_offline / totalSales) * 100 : 0
  const convPct      = totalSales > 0 ? (kpi.converted_sales     / totalSales) * 100 : 0
  const notConvPct   = totalSales > 0 ? (kpi.not_converted_sales / totalSales) * 100 : 0

  return (
    <div className="space-y-6">

      {/* ── Filter panel ──────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 rounded-lg border bg-muted/20 px-4 py-3">

        {/* Row 1: Month chips + Custom */}
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
                <button
                  onClick={clearCustom}
                  className="ml-1 opacity-60 hover:opacity-100 hover:text-red-500"
                  aria-label="Clear custom range"
                >×</button>
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
          <FilterSelect
            label={t('common.allChannels', lang)}
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'online',  label: t('common.online', lang)  },
              { value: 'offline', label: t('common.offline', lang) },
            ]}
            width="w-36"
          />
          {cmgOptions.length > 0 && (
            <MultiSelect
              label={t('common.allSegments', lang)}
              value={cmg}
              onChange={setCmg}
              options={cmgOptions}
            />
          )}
          {agentOptions.length > 0 && (
            <MultiSelect
              label={t('common.allAgents', lang)}
              value={agent}
              onChange={setAgent}
              options={agentOptions}
            />
          )}
          {hasFilter && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {t('common.resetFilters', lang)}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      {kpi.current_period_label && (
        <p className="text-xs text-muted-foreground -mt-2 px-0.5">
          {kpi.current_period_label}
          {kpi.comparison_label && <span className="ml-1 opacity-60">· {kpi.comparison_label}</span>}
        </p>
      )}

      <KpiGrid cols={4}>
        <KpiCard
          title={t('sales.totalSales', lang)}
          value={fmtBaht(kpi.converted_sales)}
          icon={ShoppingCart}
          comparison={kpi.cmp_converted_sales ?? undefined}
          comparisonLabel={kpi.comparison_label ?? undefined}
          subtitle={`${fmtBaht(kpi.converted_online)} online · ${fmtBaht(kpi.converted_offline)} offline`}
        />
        <KpiCard
          title={t('sales.avgOrderValue', lang)}
          value={kpi.avg_order_value > 0 ? fmtBaht(kpi.avg_order_value) : '—'}
          icon={ReceiptText}
          subtitle={`${fmt(kpi.converted_orders)} ${t('common.orders', lang)}`}
        />
        <KpiCard
          title={t('kpi.newCustomers', lang)}
          value={fmt(kpi.new_customers)}
          icon={Users}
          subtitle={totalBuyers > 0 ? `${((kpi.new_customers / totalBuyers) * 100).toFixed(1)}% of buyers` : '—'}
        />
        <KpiCard
          title={t('kpi.repeatCustomers', lang)}
          value={fmt(kpi.retention_customers)}
          icon={Repeat2}
          subtitle={totalBuyers > 0 ? `${((kpi.retention_customers / totalBuyers) * 100).toFixed(1)}% of buyers` : '—'}
        />
      </KpiGrid>

      {/* ── Sales Trend ───────────────────────────────────────────────────────── */}
      <SalesTrendLineChart
        cmgFilter={cmg}
        effectiveStart={effectiveStart}
        effectiveEnd={effectiveEnd}
      />

      {/* ── Distribution panels ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* Channel Breakdown — 100% stacked bar */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{t('sales.channelBreakdown', lang)}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Total sales by channel</p>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[#003DA6]" />{t('common.online', lang)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[#60a5fa]" />{t('common.offline', lang)}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart
              layout="vertical"
              data={[{
                name: 'Sales',
                online:  onlinePct,
                offline: offlinePct,
                _online_val:  kpi.total_online,
                _offline_val: kpi.total_offline,
              }]}
              margin={{ top: 24, right: 0, left: 0, bottom: 0 }}
              barSize={32}
            >
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                cursor={false}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md space-y-1.5">
                      <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-sm bg-[#003DA6]" />{t('common.online', lang)}
                        </span>
                        <span className="tabular-nums font-medium">{fmtBaht(d._online_val)} ({d.online.toFixed(1)}%)</span>
                      </div>
                      <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-sm bg-[#60a5fa]" />{t('common.offline', lang)}
                        </span>
                        <span className="tabular-nums font-medium">{fmtBaht(d._offline_val)} ({d.offline.toFixed(1)}%)</span>
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="online"  stackId="s" fill="#003DA6" radius={[4, 0, 0, 4]}>
                <LabelList
                  dataKey="online"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ x, y, width, value }: any) => {
                    const pct = value as number
                    if (!pct || pct < 8) return null
                    return <text x={(x as number) + (width as number) / 2} y={(y as number) - 5} textAnchor="middle" fontSize={11} fill="#6b7280">{Math.round(pct)}%</text>
                  }}
                />
              </Bar>
              <Bar dataKey="offline" stackId="s" fill="#60a5fa" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="offline"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ x, y, width, value }: any) => {
                    const pct = value as number
                    if (!pct || pct < 8) return null
                    return <text x={(x as number) + (width as number) / 2} y={(y as number) - 5} textAnchor="middle" fontSize={11} fill="#6b7280">{Math.round(pct)}%</text>
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground border-t pt-2">
            Total {fmtBaht(totalSales)} · {fmt(kpi.total_orders)} orders
          </p>
        </div>

        {/* Conversion Split — 100% stacked bar */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Conversion Split</h3>
              <p className="text-xs text-muted-foreground mt-0.5">HOC-attributed vs unattributed sales</p>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-green-500" />{t('sales.convertedOrders', lang)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />{t('sales.notConverted', lang)}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart
              layout="vertical"
              data={[{
                name: 'Orders',
                converted:     convPct,
                not_converted: notConvPct,
                _conv_val:     kpi.converted_sales,
                _not_conv_val: kpi.not_converted_sales,
              }]}
              margin={{ top: 24, right: 0, left: 0, bottom: 0 }}
              barSize={32}
            >
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                cursor={false}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md space-y-1.5">
                      <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-sm bg-green-500" />{t('sales.convertedOrders', lang)}
                        </span>
                        <span className="tabular-nums font-medium">{fmtBaht(d._conv_val)} ({d.converted.toFixed(1)}%)</span>
                      </div>
                      <div className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />{t('sales.notConverted', lang)}
                        </span>
                        <span className="tabular-nums font-medium">{fmtBaht(d._not_conv_val)} ({d.not_converted.toFixed(1)}%)</span>
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="converted"     stackId="s" fill="#22c55e" radius={[4, 0, 0, 4]}>
                <LabelList
                  dataKey="converted"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ x, y, width, value }: any) => {
                    const pct = value as number
                    if (!pct || pct < 8) return null
                    return <text x={(x as number) + (width as number) / 2} y={(y as number) - 5} textAnchor="middle" fontSize={11} fill="#6b7280">{Math.round(pct)}%</text>
                  }}
                />
              </Bar>
              <Bar dataKey="not_converted" stackId="s" fill="#fbbf24" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="not_converted"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ x, y, width, value }: any) => {
                    const pct = value as number
                    if (!pct || pct < 8) return null
                    return <text x={(x as number) + (width as number) / 2} y={(y as number) - 5} textAnchor="middle" fontSize={11} fill="#6b7280">{Math.round(pct)}%</text>
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground border-t pt-2">
            {fmt(kpi.new_customers)} new · {fmt(kpi.retention_customers)} repeat buyers
          </p>
        </div>

      </div>

      {/* ── Product Sales Bubble Map ───────────────────────────────────────────── */}
      {by_bubble.length > 0 && (
        <SplitBubbleChart data={by_bubble} height={440} />
      )}

      {/* ── Agent Performance ─────────────────────────────────────────────────── */}
      {agentRows && agentRows.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h3 className="text-sm font-semibold">{t('sales.leaderboard', lang)}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Ranked by converted sales</p>
            </div>
            <span className="text-xs text-muted-foreground">{agentRows.length} agents</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center px-3">#</TableHead>
                <TableHead>{t('common.agent', lang)}</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead className="text-right pr-4">Conv. Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentRows.map((row, i) => (
                <TableRow key={row.agent}>
                  <TableCell className="text-center px-3 text-muted-foreground tabular-nums text-xs">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.agent}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmtBaht(row.sales_total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(row.order_total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(row.call_total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(row.converted_customers)}</TableCell>
                  <TableCell className={`text-right tabular-nums text-sm pr-4 font-medium ${colorRate(row.conversion_rate, [0.3, 0.15])}`}>
                    {row.call_total > 0 ? formatPct(row.conversion_rate) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  )
}
