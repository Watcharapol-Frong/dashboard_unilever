'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'

import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange } from '@/hooks/useMonthRange'
import { fmtBaht, colorAchievement, colorRoi } from '@/lib/formatters'
import { type OverviewRow } from './columns'
import {
  TrendingUp, Target, Users, UserPlus, PhoneCall,
  Calendar, Calculator,
} from 'lucide-react'

const OverviewChart = dynamic(
  () => import('./OverviewChart').then(m => m.OverviewChart),
  { ssr: false, loading: () => <Skeleton className="h-[640px] w-full rounded-xl" /> }
)

type Agg = {
  hoc_sales: number; new_customers: number; retention: number
  ordered: number; hoc_orders: number; total_incentive: number
  sales_target: number; total_calls: number; reached: number
  total_agent_cost: number; total_expense: number; roi: number; achievement: number
  online_sales: number; offline_sales: number
}

function aggregate(rows: OverviewRow[], filterChannel = 'all'): Agg {
  const s = (k: keyof OverviewRow) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const hoc_sales     = s('hoc_sales')
  const new_customers = s('new_customers')
  const retention     = s('retention')
  const ordered       = s('ordered')
  const hoc_orders    = s('hoc_orders')
  const sales_target  = s('sales_target')
  // Remap online/offline based on channel filter so chart bars reflect the selection
  const online_sales  = filterChannel === 'offline' ? 0 : s('online_sales')
  const offline_sales = filterChannel === 'online'  ? 0 : s('offline_sales')

  // total_calls/reached are now CMG-specific — sum directly
  // total_incentive/total_agent_cost are month-level — deduplicate by month
  // total_calls/reached are CMG-specific — sum directly
  // total_incentive/total_agent_cost are month-level — deduplicate by month
  // incentive_hoc_sales is CMG-level but already zero for ineligible CMGs — sum directly
  const seen = new Set<string>()
  let total_calls = 0, reached = 0, total_incentive = 0, total_agent_cost = 0
  for (const r of rows) {
    total_calls += r.total_calls
    reached     += r.reached
    if (!seen.has(r.month)) {
      seen.add(r.month)
      total_incentive  += r.total_incentive
      total_agent_cost += r.total_agent_cost
    }
  }
  const total_expense     = total_incentive + total_agent_cost
  const incentive_hoc_sales = s('incentive_hoc_sales')
  // ROI uses incentive-eligible sales basis (consistent with incentives page)
  const roi               = total_expense > 0 ? incentive_hoc_sales / total_expense : 0
  const achievement   = sales_target  > 0 ? (hoc_sales / sales_target) * 100 : 0
  return {
    hoc_sales, new_customers, retention, ordered, hoc_orders, total_incentive,
    sales_target, total_calls, reached, total_agent_cost, total_expense, roi, achievement,
    online_sales, offline_sales,
  }
}

export default function OverviewClient() {
  const { data: rows = [], isLoading } = useDashboardSWR<OverviewRow[]>('/api/data/overview')

  const months     = useMemo(() => [...new Set(rows.map(r => r.month))].sort(), [rows])
  const cmgOptions = useMemo(() => [...new Set(rows.map(r => r.dynamic_cmg))].sort(), [rows])

  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick, clearRange, activeRangeLabel,
  } = useMonthRange()
  const [filterCmg,  setFilterCmg]  = useState<string[]>([])
  const [filterChannel, setFilterChannel] = useState('all')

  const filtered = useMemo(() => {
    const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
    return rows.filter(r => {
      if (filterCmg.length > 0 && !filterCmg.includes(r.dynamic_cmg)) return false
      if (rangeFrom) {
        if (!effectiveTo) return r.month === rangeFrom
        if (r.month < rangeFrom || r.month > effectiveTo) return false
      }
      return true
    })
  }, [rows, filterCmg, rangeFrom, rangeTo, hoverMonth])

  const mappedFiltered = useMemo(() => {
    return filtered.map(r => {
      if (filterChannel === 'online') {
        const total = r.online_new_customers + r.online_retention
        return {
          ...r,
          hoc_sales: r.online_sales,
          hoc_orders: r.online_orders,
          new_customers: r.online_new_customers,
          retention: r.online_retention,
          ordered: total,
        }
      } else if (filterChannel === 'offline') {
        const total = r.offline_new_customers + r.offline_retention
        return {
          ...r,
          hoc_sales: r.offline_sales,
          hoc_orders: r.offline_orders,
          new_customers: r.offline_new_customers,
          retention: r.offline_retention,
          ordered: total,
        }
      }
      return r
    })
  }, [filtered, filterChannel])

  const kpi = useMemo(() => aggregate(mappedFiltered, filterChannel), [mappedFiltered, filterChannel])

  // ROI uses month-level data regardless of CMG filter (costs are not CMG-specific)
  const roiKpi = useMemo(() => {
    const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
    const monthRows = rows.filter(r => {
      if (rangeFrom) {
        if (!effectiveTo) return r.month === rangeFrom
        if (r.month < rangeFrom || r.month > effectiveTo) return false
      }
      return true
    })
    return aggregate(monthRows, filterChannel)
  }, [rows, rangeFrom, rangeTo, hoverMonth, filterChannel])

  const byMonth = useMemo(() => {
    const monthSet = [...new Set(mappedFiltered.map(r => r.month))].sort()
    return monthSet.map(month => {
      const mRows = mappedFiltered.filter(r => r.month === month)
      const agg   = aggregate(mRows, filterChannel)
      return { month_label: mRows[0]?.month_label ?? month, ...agg }
    })
  }, [mappedFiltered, filterChannel])

  if (isLoading) return <PageLoading cols={6} />
  if (rows.length === 0) return (
    <PageEmpty message="No data available" hint="Please run Build Mart first" />
  )

  return (
    <div className="space-y-6">

      {/* Date Range Selection & Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter & Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <MonthChipGroup
              months={months}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              hoverMonth={hoverMonth}
              onChipClick={handleChipClick}
              onMouseEnter={setHoverMonth}
              onMouseLeave={() => setHoverMonth(null)}
            />

            <div className="w-px h-6 bg-border hidden lg:block" />

            <MultiSelect
              label="Customer Segmentation"
              value={filterCmg}
              onChange={setFilterCmg}
              options={cmgOptions.map(v => ({ value: v, label: v }))}
              width="w-full sm:w-56"
            />

            <FilterSelect
              label="All Channels"
              value={filterChannel}
              onChange={setFilterChannel}
              options={[
                { value: 'online', label: 'Online Sales' },
                { value: 'offline', label: 'Offline Sales' },
              ]}
              width="w-full sm:w-48"
            />

            {(rangeFrom || filterCmg.length > 0 || filterChannel !== 'all') && (
              <button
                onClick={() => { clearRange(); setFilterCmg([]); setFilterChannel('all') }}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            {rangeFrom
              ? <>Showing: <span className="font-medium text-foreground">{activeRangeLabel}</span></>
              : <>Showing: <span className="font-medium text-foreground">all available periods</span> — select month chips to filter by period</>
            }
          </p>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <KpiGrid cols={6}>
        <KpiCard
          title="HOC Sales"
          value={fmtBaht(kpi.hoc_sales)}
          subtitle={`Target ${fmtBaht(kpi.sales_target)}`}
          icon={TrendingUp}
          tooltip="Revenue from HOC Unilever products ordered within the attribution window (converted customers only). Excludes not-converted orders."
        />
        <KpiCard
          title="Achievement"
          value={`${kpi.achievement.toFixed(1)}%`}
          subtitle={kpi.achievement >= 100 ? 'Target reached ✓' : 'Below target'}
          valueClassName={colorAchievement(kpi.achievement)}
          icon={Target}
          tooltip="HOC Sales as a percentage of the monthly sales target. Calculated per CMG and summed across the selected period."
        />
        <KpiCard
          title="New Customers"
          value={kpi.new_customers.toLocaleString()}
          subtitle="Telesales new buyers"
          icon={UserPlus}
          tooltip="Unique customers placing their first HOC order within the attribution window. Excludes first-order-not-converted."
        />
        <KpiCard
          title="Repeat Customers"
          value={kpi.retention.toLocaleString()}
          subtitle="Telesales repeat buyers"
          icon={Users}
          tooltip="Unique customers who reordered HOC products within the attribution window. Excludes retention-not-converted."
        />
        <KpiCard
          title="Total Calls"
          value={kpi.total_calls.toLocaleString()}
          subtitle={`Reached ${kpi.reached.toLocaleString()}`}
          icon={PhoneCall}
          tooltip={filterCmg.length > 0
            ? "Counts calls to customers with at least one order in the selected CMG. Customers with no orders cannot be assigned a CMG."
            : "Total unique customers called by the telesales team. 'Reached' excludes unreachable statuses (no answer, switched off, unavailable)."}
        />
        <KpiCard
          title="Program ROI"
          value={roiKpi.roi > 0 ? `${roiKpi.roi.toFixed(2)}x` : '—'}
          subtitle="Sales / Expense multiplier"
          valueClassName={colorRoi(roiKpi.roi)}
          icon={Calculator}
          tooltip="HOC Sales ÷ Total Program Expense (incentives + agent costs). Always month-level — not affected by CMG filter because costs are shared across all CMGs."
        />
      </KpiGrid>

      {/* Charts — rendered client-side only (recharts SSR fix) */}
      <OverviewChart
        byMonth={byMonth}
        kpi={kpi}
        filterCmg={filterCmg}
        filterChannel={filterChannel}
        startDate={rangeFrom}
        endDate={rangeTo ?? rangeFrom}
      />
    </div>
  )
}
