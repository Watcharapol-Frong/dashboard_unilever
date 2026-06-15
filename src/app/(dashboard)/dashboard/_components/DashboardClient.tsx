'use client'

import { useState, useMemo, useEffect } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  ShoppingCart, Target, Users, TrendingUp,
  PhoneCall, PhoneForwarded, UserCheck, Percent,
} from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox }  from '@/components/ui/checkbox'
import { ChevronDown } from 'lucide-react'
import { useDashboardSWR }    from '@/hooks/useDashboardSWR'
import { KpiCard }            from '@/components/dashboard/KpiCard'
import { KpiGrid }            from '@/components/dashboard/KpiGrid'
import { MonthChipGroup }     from '@/components/dashboard/MonthChipGroup'
import { SalesTrendChart }           from '@/components/dashboard/SalesTrendChart'
import { TelesalesTrendMiniChart }   from '@/components/dashboard/TelesalesTrendMiniChart'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import {
  fmtBaht, fmt, formatPct,
  colorAchievement, colorRoi, colorRate,
} from '@/lib/formatters'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'
import { useLocalState } from '@/hooks/useLocalState'

// ── Types ─────────────────────────────────────────────────────────────────────
type SalesRow = {
  month: string; hoc_sales: number; target: number; achievement: number
  new_customers: number; retention: number; buyers: number; roi: number; expense: number
}
type TeleRow = {
  month: string; total_calls: number; reached: number; converted: number
  reach_rate: number; conversion_rate: number
}
type ApiData = { sales: SalesRow[]; telesales: TeleRow[]; cmg_options: string[] }

// ── Helpers ───────────────────────────────────────────────────────────────────
const mom = (curr: number, prev: number | undefined) =>
  prev !== undefined && prev > 0 ? (curr - prev) / prev : undefined

const toLocalDate = (d: Date): string => {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const monthLastDay = (isoFirst: string): string => {
  const [y, m] = isoFirst.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
}

// Does a month row (period = "YYYY-MM-01") overlap with [start, end] date range?
const monthOverlaps = (period: string, start: string, end: string) =>
  period <= end && monthLastDay(period) >= start

// ── Component ─────────────────────────────────────────────────────────────────
export function DashboardClient() {
  const { lang } = useLanguage()
  // ── CMG multiselect ─────────────────────────────────────────────────────────
  const [cmgFilter, setCmgFilter] = useLocalState<string[]>('dash:cmg', [])
  const cmgQuery = cmgFilter.length > 0
    ? `?cmg=${cmgFilter.map(encodeURIComponent).join(',')}`
    : ''

  const { data, isLoading, error } = useDashboardSWR<ApiData>(
    `/api/data/dashboard/summary${cmgQuery}`,
  )

  const cmgOptions = data?.cmg_options ?? []
  const isCmgActive = (c: string) => cmgFilter.length === 0 || cmgFilter.includes(c)
  const toggleCmg = (c: string) => {
    if (cmgFilter.length === 0) {
      setCmgFilter(cmgOptions.filter(x => x !== c))
    } else {
      const isOn = cmgFilter.includes(c)
      if (isOn) {
        const next = cmgFilter.filter(x => x !== c)
        setCmgFilter(next.length === 0 ? [] : next)
      } else {
        const next = [...cmgFilter, c]
        setCmgFilter(next.length === cmgOptions.length ? [] : next)
      }
    }
  }

  // ── Month chip range (YYYY-MM) ───────────────────────────────────────────────
  const [rangeFrom,  setRangeFrom]  = useLocalState<string | null>('dash:month:from', null)
  const [rangeTo,    setRangeTo]    = useLocalState<string | null>('dash:month:to', null)
  const [hoverMonth, setHoverMonth] = useState<string | null>(null)

  const allMonths = useMemo(() => {
    if (!data) return []
    const set = new Set([
      ...data.sales.map(s => s.month.substring(0, 7)),
      ...data.telesales.map(t => t.month.substring(0, 7)),
    ])
    return [...set].sort()
  }, [data])

  // Auto-select full available range on first load
  useEffect(() => {
    if (allMonths.length > 0 && rangeFrom === null && rangeTo === null) {
      setRangeFrom(allMonths[0])
      setRangeTo(allMonths[allMonths.length - 1])
    }
  }, [allMonths, rangeFrom, rangeTo])

  const handleChipClick = (m: string) => {
    // Switching to chips clears custom mode
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

  // ── Custom date range ────────────────────────────────────────────────────────
  const [filterMode,    setFilterMode]    = useState<'chips' | 'custom'>('chips')
  const [customRange,   setCustomRange]   = useState<DateRange>({ from: undefined, to: undefined })
  const [calendarOpen,  setCalendarOpen]  = useState(false)

  const customLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    if (!customRange.from) return 'Custom Range'
    return customRange.to
      ? `${fmt(customRange.from)} – ${fmt(customRange.to)}`
      : fmt(customRange.from)
  })()

  const clearCustom = () => {
    setFilterMode('chips')
    setCustomRange({ from: undefined, to: undefined })
  }

  // ── Effective date range (YYYY-MM-DD) — unified source for all consumers ─────
  const effectiveStart = useMemo((): string | null => {
    if (filterMode === 'custom') {
      return customRange.from ? toLocalDate(customRange.from) : null
    }
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

  // ── Aggregate sales ──────────────────────────────────────────────────────────
  const salesInRange = useMemo(() => {
    if (!data) return []
    if (!effectiveStart || !effectiveEnd) return data.sales
    return data.sales.filter(s => monthOverlaps(s.month, effectiveStart, effectiveEnd))
  }, [data, effectiveStart, effectiveEnd])

  const aggSales = useMemo(() => {
    if (salesInRange.length === 0)
      return { hoc_sales: 0, target: 0, new_customers: 0, retention: 0, buyers: 0, achievement: 0, roi: 0, expense: 0 }
    const hoc_sales     = salesInRange.reduce((sum, s) => sum + s.hoc_sales, 0)
    const target        = salesInRange.reduce((sum, s) => sum + s.target, 0)
    const new_customers = salesInRange.reduce((sum, s) => sum + s.new_customers, 0)
    const retention     = salesInRange.reduce((sum, s) => sum + s.retention, 0)
    const expense       = salesInRange.reduce((sum, s) => sum + s.expense, 0)
    const last          = salesInRange[salesInRange.length - 1]
    return {
      hoc_sales, target, new_customers, retention,
      buyers:      new_customers + retention,
      achievement: target > 0 ? hoc_sales / target : 0,
      roi:         last.roi,
      expense,
    }
  }, [salesInRange])

  // ── Aggregate telesales ──────────────────────────────────────────────────────
  const teleInRange = useMemo(() => {
    if (!data) return []
    if (!effectiveStart || !effectiveEnd) return data.telesales
    return data.telesales.filter(t => monthOverlaps(t.month, effectiveStart, effectiveEnd))
  }, [data, effectiveStart, effectiveEnd])

  const aggTele = useMemo(() => {
    if (teleInRange.length === 0) return null
    const total_calls = teleInRange.reduce((sum, t) => sum + t.total_calls, 0)
    const reached     = teleInRange.reduce((sum, t) => sum + t.reached, 0)
    const converted   = teleInRange.reduce((sum, t) => sum + t.converted, 0)
    return {
      total_calls, reached, converted,
      reach_rate:      total_calls > 0 ? reached / total_calls : 0,
      conversion_rate: reached > 0 ? converted / reached : 0,
    }
  }, [teleInRange])

  // MoM — only for single-month selections
  const isSingleMonth = Boolean(
    effectiveStart && effectiveEnd &&
    effectiveStart.substring(0, 7) === effectiveEnd.substring(0, 7),
  )
  const salesIdx = isSingleMonth && data
    ? data.sales.findIndex(s => s.month.substring(0, 7) === effectiveStart!.substring(0, 7))
    : -1
  const sPrev = salesIdx > 0 ? data!.sales[salesIdx - 1] : undefined
  const teleIdx = isSingleMonth && data
    ? data.telesales.findIndex(t => t.month.substring(0, 7) === effectiveStart!.substring(0, 7))
    : -1
  const tPrev = teleIdx > 0 ? data!.telesales[teleIdx - 1] : undefined

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isLoading && !data) return <PageLoading cols={4} />
  if (error)              return <PageError message={error.message} />
  if (!data || (data.sales.length === 0 && data.telesales.length === 0)) {
    return <PageEmpty message={t('common.noData', lang)} hint={t('common.buildFirst', lang)} />
  }

  return (
    <div className="space-y-6">
      {/* ── Combined filter ────────────────────────────────────────────────── */}
      <div className="space-y-2.5 rounded-lg border bg-muted/20 px-4 py-3">

        {/* Row 1: Month chips + Custom button */}
        <div className="flex items-start gap-3">
          <span className="mt-1.5 w-12 shrink-0 text-xs text-muted-foreground">Month</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {filterMode === 'chips' && (
              <MonthChipGroup
                months={allMonths}
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

            {/* Custom range picker */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => {
                    // Pre-populate calendar with the currently visible date range
                    if (filterMode === 'chips' && effectiveStart) {
                      const isoToLocal = (iso: string) => {
                        const [y, m, d] = iso.split('-').map(Number)
                        return new Date(y, m - 1, d)
                      }
                      setCustomRange({
                        from: isoToLocal(effectiveStart),
                        to:   effectiveEnd ? isoToLocal(effectiveEnd) : undefined,
                      })
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
                  onSelect={(range) => {
                    setCustomRange(range ?? { from: undefined, to: undefined })
                    if (range?.from && range?.to) setCalendarOpen(false)
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Row 2: Customer Segment */}
        {cmgOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">Filters</span>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground">
                  <span>
                    {cmgFilter.length === 0
                      ? t('common.allSegments', lang)
                      : cmgFilter.length === 1
                      ? cmgFilter[0]
                      : `${cmgFilter.length} of ${cmgOptions.length} Segments`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-2">
                <button
                  onClick={() => setCmgFilter([])}
                  className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                >
                  {cmgFilter.length === 0 ? '✓ All segments selected' : 'Select all'}
                </button>
                <div className="my-1 border-t" />
                <div className="space-y-1">
                  {cmgOptions.map(c => (
                    <label
                      key={c}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Checkbox checked={isCmgActive(c)} onCheckedChange={() => toggleCmg(c)} />
                      {c}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* ── Sales Performance ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-[#003DA6]" />
          <h2 className="text-sm font-semibold">{t('nav.salesPerformance', lang)}</h2>
          <span className="text-xs text-muted-foreground">· by order date</span>
        </div>
        <KpiGrid cols={4}>
          <KpiCard
            title={t('kpi.hocSales', lang)}
            value={fmtBaht(aggSales.hoc_sales)}
            icon={ShoppingCart}
            comparison={isSingleMonth ? mom(aggSales.hoc_sales, sPrev?.hoc_sales) : undefined}
            comparisonLabel="vs previous month"
            subtitle={`${t('common.target', lang)} ${fmtBaht(aggSales.target)}`}
          />
          <KpiCard
            title={t('kpi.achievement', lang)}
            value={aggSales.target > 0 ? formatPct(aggSales.achievement) : '—'}
            icon={Target}
            valueClassName={colorAchievement(aggSales.achievement * 100)}
            subtitle={`of ${fmtBaht(aggSales.target)} target`}
          />
          <KpiCard
            title="Buyers"
            value={fmt(aggSales.buyers)}
            icon={Users}
            comparison={isSingleMonth ? mom(aggSales.buyers, sPrev?.buyers) : undefined}
            comparisonLabel="vs previous month"
            subtitle={`${fmt(aggSales.new_customers)} new · ${fmt(aggSales.retention)} repeat`}
          />
          <KpiCard
            title="ROI"
            value={aggSales.roi > 0 ? `${aggSales.roi.toFixed(1)}×` : '—'}
            icon={TrendingUp}
            valueClassName={colorRoi(aggSales.roi)}
            tooltip="Programme-level ROI — costs are not split by CMG, so this figure covers all CMGs regardless of the CMG filter."
          />
        </KpiGrid>

        <div className="mt-6">
          <SalesTrendChart
            cmgFilter={cmgFilter}
            effectiveStart={effectiveStart}
            effectiveEnd={effectiveEnd}
          />
        </div>
      </section>

      {/* ── Telesales Performance ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-[#003DA6]" />
          <h2 className="text-sm font-semibold">{t('topbar.telesales', lang)} Performance</h2>
          <span className="text-xs text-muted-foreground">· by call date</span>
        </div>
        {aggTele ? (
          <>
            <KpiGrid cols={4}>
              <KpiCard
                title={t('kpi.totalCalls', lang)}
                value={fmt(aggTele.total_calls)}
                icon={PhoneCall}
                comparison={isSingleMonth ? mom(aggTele.total_calls, tPrev?.total_calls) : undefined}
                comparisonLabel="vs previous month"
                subtitle="customers contacted"
              />
              <KpiCard
                title={t('telesales.reached', lang)}
                value={fmt(aggTele.reached)}
                icon={PhoneForwarded}
                valueClassName={colorRate(aggTele.reach_rate, [0.6, 0.4])}
                subtitle={`${formatPct(aggTele.reach_rate)} ${t('telesales.reachRate', lang).toLowerCase()}`}
              />
              <KpiCard
                title="Converted"
                value={fmt(aggTele.converted)}
                icon={UserCheck}
                comparison={isSingleMonth ? mom(aggTele.converted, tPrev?.converted) : undefined}
                comparisonLabel="vs previous month"
                subtitle="became customers"
              />
              <KpiCard
                title={t('telesales.convRate', lang)}
                value={aggTele.reached > 0 ? formatPct(aggTele.conversion_rate) : '—'}
                icon={Percent}
                valueClassName={colorRate(aggTele.conversion_rate, [0.3, 0.15])}
                comparison={isSingleMonth ? mom(aggTele.conversion_rate, tPrev?.conversion_rate) : undefined}
                comparisonLabel="vs previous month"
                subtitle="of reached customers"
              />
            </KpiGrid>
            <TelesalesTrendMiniChart effectiveStart={effectiveStart} effectiveEnd={effectiveEnd} />
          </>
        ) : (
          <PageEmpty message={t('telesales.noData', lang)} />
        )}
      </section>
    </div>
  )
}
