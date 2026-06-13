'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ShoppingCart, Target, Users, TrendingUp,
  PhoneCall, PhoneForwarded, UserCheck, Percent,
} from 'lucide-react'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useDashboardSWR }  from '@/hooks/useDashboardSWR'
import { KpiCard }          from '@/components/dashboard/KpiCard'
import { KpiGrid }          from '@/components/dashboard/KpiGrid'
import { FilterSelect }     from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import {
  fmtBaht, fmt, fmtPct, formatPct,
  colorAchievement, colorRoi, colorRate,
} from '@/lib/formatters'

type SalesRow = {
  month: string
  hoc_sales: number
  target: number
  achievement: number
  new_customers: number
  retention: number
  buyers: number
  roi: number
  expense: number
}

type TeleRow = {
  month: string
  total_calls: number
  reached: number
  converted: number
  reach_rate: number
  conversion_rate: number
}

type ApiData = {
  sales: SalesRow[]
  telesales: TeleRow[]
  cmg_options: string[]
}

const monthLabel = (m: string) =>
  new Date(m).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

// month-over-month ratio: (curr - prev) / prev
const mom = (curr: number, prev: number | undefined) =>
  prev !== undefined && prev > 0 ? (curr - prev) / prev : undefined

function MonthSelect({ months, value, onChange }: {
  months: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-36 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map(m => (
          <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DashboardClient() {
  const [cmg, setCmg] = useState('all')
  const cmgQuery = cmg === 'all' ? '' : `?cmg=${encodeURIComponent(cmg)}`
  const { data, isLoading, error } = useDashboardSWR<ApiData>(`/api/data/dashboard/summary${cmgQuery}`)

  const salesMonths = useMemo(() => data?.sales.map(s => s.month) ?? [], [data])
  const teleMonths  = useMemo(() => data?.telesales.map(t => t.month) ?? [], [data])

  const [salesMonth, setSalesMonth] = useState('')
  const [teleMonth,  setTeleMonth]  = useState('')

  // Default each section to its latest available month
  useEffect(() => {
    if (salesMonths.length && !salesMonths.includes(salesMonth)) {
      setSalesMonth(salesMonths[salesMonths.length - 1])
    }
  }, [salesMonths, salesMonth])
  useEffect(() => {
    if (teleMonths.length && !teleMonths.includes(teleMonth)) {
      setTeleMonth(teleMonths[teleMonths.length - 1])
    }
  }, [teleMonths, teleMonth])

  if (isLoading && !data) return <PageLoading cols={4} />
  if (error) return <PageError message={error.message} />
  if (!data || (data.sales.length === 0 && data.telesales.length === 0)) {
    return <PageEmpty message="No data available" hint="Run Build Mart in Data Hub first" />
  }

  // ── Sales section ───────────────────────────────────────────────────────────
  const sIdx  = data.sales.findIndex(s => s.month === salesMonth)
  const s     = sIdx >= 0 ? data.sales[sIdx] : undefined
  const sPrev = sIdx > 0 ? data.sales[sIdx - 1] : undefined

  // ── Telesales section ───────────────────────────────────────────────────────
  const tIdx  = data.telesales.findIndex(t => t.month === teleMonth)
  const t     = tIdx >= 0 ? data.telesales[tIdx] : undefined
  const tPrev = tIdx > 0 ? data.telesales[tIdx - 1] : undefined

  return (
    <div className="space-y-8">
      {/* ── Sales Performance ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[#003DA6]" />
            <h2 className="text-sm font-semibold">Sales Performance</h2>
            <span className="text-xs text-muted-foreground">· by order date</span>
          </div>
          <div className="flex items-center gap-2">
            <FilterSelect
              label="All CMGs"
              value={cmg}
              onChange={setCmg}
              options={data.cmg_options.map(c => ({ value: c, label: c }))}
            />
            <MonthSelect months={salesMonths} value={salesMonth} onChange={setSalesMonth} />
          </div>
        </div>

        {s ? (
          <KpiGrid cols={4}>
            <KpiCard
              title="HOC Sales"
              value={fmtBaht(s.hoc_sales)}
              icon={ShoppingCart}
              comparison={mom(s.hoc_sales, sPrev?.hoc_sales)}
              comparisonLabel="vs previous month"
              subtitle={`Target ${fmtBaht(s.target)}`}
            />
            <KpiCard
              title="Achievement"
              value={s.target > 0 ? formatPct(s.achievement) : '—'}
              icon={Target}
              valueClassName={colorAchievement(s.achievement * 100)}
              subtitle={`of ${fmtBaht(s.target)} target`}
            />
            <KpiCard
              title="Buyers"
              value={fmt(s.buyers)}
              icon={Users}
              comparison={mom(s.buyers, sPrev?.buyers)}
              comparisonLabel="vs previous month"
              subtitle={`${fmt(s.new_customers)} new · ${fmt(s.retention)} repeat`}
            />
            <KpiCard
              title="ROI"
              value={s.roi > 0 ? `${s.roi.toFixed(1)}×` : '—'}
              icon={TrendingUp}
              valueClassName={colorRoi(s.roi)}
              subtitle={`${fmtBaht(s.expense)} expense`}
              tooltip="Programme-level ROI — costs are not split by CMG, so this figure covers all CMGs regardless of the CMG filter."
            />
          </KpiGrid>
        ) : (
          <PageEmpty message="No sales data for this month" />
        )}
      </section>

      {/* ── Telesales Performance ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-[#003DA6]" />
            <h2 className="text-sm font-semibold">Telesales Performance</h2>
            <span className="text-xs text-muted-foreground">· by call date</span>
          </div>
          <MonthSelect months={teleMonths} value={teleMonth} onChange={setTeleMonth} />
        </div>

        {t ? (
          <KpiGrid cols={4}>
            <KpiCard
              title="Total Calls"
              value={fmt(t.total_calls)}
              icon={PhoneCall}
              comparison={mom(t.total_calls, tPrev?.total_calls)}
              comparisonLabel="vs previous month"
              subtitle="customers contacted"
            />
            <KpiCard
              title="Reached"
              value={fmt(t.reached)}
              icon={PhoneForwarded}
              valueClassName={colorRate(t.reach_rate, [0.6, 0.4])}
              subtitle={`${formatPct(t.reach_rate)} reach rate`}
            />
            <KpiCard
              title="Converted"
              value={fmt(t.converted)}
              icon={UserCheck}
              comparison={mom(t.converted, tPrev?.converted)}
              comparisonLabel="vs previous month"
              subtitle="became customers"
            />
            <KpiCard
              title="Conversion Rate"
              value={t.reached > 0 ? formatPct(t.conversion_rate) : '—'}
              icon={Percent}
              valueClassName={colorRate(t.conversion_rate, [0.3, 0.15])}
              comparison={mom(t.conversion_rate, tPrev?.conversion_rate)}
              comparisonLabel="vs previous month"
              subtitle="of reached customers"
            />
          </KpiGrid>
        ) : (
          <PageEmpty message="No telesales data for this month" />
        )}
      </section>
    </div>
  )
}
