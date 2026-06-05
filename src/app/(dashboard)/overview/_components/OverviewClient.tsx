'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { FilterSelect } from '@/components/dashboard/FilterSelect'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'

import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange, lastDayOfMonth } from '@/hooks/useMonthRange'
import { fmtBaht, colorAchievement, colorRoi, formatTHB } from '@/lib/formatters'
import { type OverviewRow } from './columns'
import {
  TrendingUp, Target, Users, UserPlus, PhoneCall,
  Calendar, Calculator,
} from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { t } from '@/lib/i18n'

const OverviewChart = dynamic(
  () => import('./OverviewChart').then(m => m.OverviewChart),
  { ssr: false, loading: () => <div className="h-[640px] w-full rounded-xl bg-muted animate-pulse" /> }
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

interface OverviewData {
  rows: OverviewRow[]
  all_time_calls: number
}

export default function OverviewClient() {
  const { lang } = useLanguage()
  const { data, isLoading } = useDashboardSWR<OverviewData>('/api/data/overview')
  const rows         = data?.rows         ?? []
  const allTimeCalls = data?.all_time_calls ?? 0

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

  // Call stats from telesales_calls directly — accurate COUNT DISTINCT (not limited to ordered MMIDs)
  const callsApiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (rangeFrom) {
      p.set('startDate', rangeFrom)
      p.set('endDate', lastDayOfMonth(rangeTo ?? rangeFrom))
    }
    if (filterCmg.length > 0) p.set('cmg', filterCmg.join(','))
    return `/api/data/overview/calls?${p.toString()}`
  }, [rangeFrom, rangeTo, filterCmg])

  const { data: callStats } = useDashboardSWR<{ total_calls: number; connected: number }>(callsApiUrl)

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
    <PageEmpty message={t('common.noData', lang)} hint={t('common.buildFirst', lang)} />
  )

  return (
    <div className="space-y-6">

      {/* Date Range Selection & Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">{t('common.filterRange', lang)}</CardTitle>
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
              label={t('common.allSegments', lang)}
              value={filterCmg}
              onChange={setFilterCmg}
              options={cmgOptions.map(v => ({ value: v, label: v }))}
              width="w-full sm:w-56"
            />

            <FilterSelect
              label={t('common.allChannels', lang)}
              value={filterChannel}
              onChange={setFilterChannel}
              options={[
                { value: 'online', label: t('common.onlineSales', lang) },
                { value: 'offline', label: t('common.offlineSales', lang) },
              ]}
              width="w-full sm:w-48"
            />

            {(rangeFrom || filterCmg.length > 0 || filterChannel !== 'all') && (
              <button
                onClick={() => { clearRange(); setFilterCmg([]); setFilterChannel('all') }}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                {t('common.resetFilters', lang)}
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            {rangeFrom
              ? <>{t('common.showing', lang)}: <span className="font-medium text-foreground">{activeRangeLabel}</span></>
              : <>{t('common.showing', lang)}: <span className="font-medium text-foreground">{t('common.allPeriods', lang)}</span> — {t('common.selectChips', lang)}</>
            }
          </p>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <KpiGrid cols={6}>
        <KpiCard
          title={t('kpi.hocSales', lang)}
          value={fmtBaht(kpi.hoc_sales)}
          subtitle={`${t('common.target', lang)} ${fmtBaht(kpi.sales_target)}`}
          icon={TrendingUp}
          tooltip={lang === 'th'
            ? `HOC Sales: ${formatTHB(kpi.hoc_sales)}\nTarget: ${formatTHB(kpi.sales_target)}\nAchievement: ${kpi.achievement.toFixed(1)}%\n\nยอดขายสินค้า HOC ของ Unilever จากลูกค้าที่สั่งซื้อภายใน attribution window (เฉพาะที่ convert) ไม่รวมคำสั่งซื้อที่ไม่ convert`
            : `HOC Sales: ${formatTHB(kpi.hoc_sales)}\nTarget: ${formatTHB(kpi.sales_target)}\nAchievement: ${kpi.achievement.toFixed(1)}%\n\nRevenue from HOC Unilever products ordered within the attribution window (converted customers only). Excludes not-converted orders.`
          }
        />
        <KpiCard
          title={t('kpi.achievement', lang)}
          value={`${kpi.achievement.toFixed(1)}%`}
          subtitle={kpi.achievement >= 100 ? t('kpi.targetReached', lang) : t('kpi.belowTarget', lang)}
          valueClassName={colorAchievement(kpi.achievement)}
          icon={Target}
          tooltip={lang === 'th'
            ? 'HOC Sales คิดเป็น % ของ Target รายเดือน คำนวณรายกลุ่มและรวมตลอดช่วงที่เลือก'
            : 'HOC Sales as a percentage of the monthly sales target. Calculated per segment and summed across the selected period.'
          }
        />
        <KpiCard
          title={t('kpi.newCustomers', lang)}
          value={kpi.new_customers.toLocaleString()}
          subtitle={t('kpi.newBuyers', lang)}
          icon={UserPlus}
          tooltip={lang === 'th'
            ? 'ลูกค้าที่สั่งซื้อ HOC ครั้งแรกภายใน attribution window ไม่รวมลูกค้าที่สั่งซื้อนอกช่วง'
            : 'Unique customers placing their first HOC order within the attribution window. Excludes first-order-not-converted.'
          }
        />
        <KpiCard
          title={t('kpi.repeatCustomers', lang)}
          value={kpi.retention.toLocaleString()}
          subtitle={t('kpi.repeatBuyers', lang)}
          icon={Users}
          tooltip={lang === 'th'
            ? 'ลูกค้าที่เคยซื้อ HOC มาก่อนและซื้อซ้ำภายใน attribution window ไม่รวมการซื้อซ้ำที่อยู่นอกช่วง'
            : 'Unique customers who reordered HOC products within the attribution window. Excludes retention-not-converted.'
          }
        />
        <KpiCard
          title={t('kpi.totalCalls', lang)}
          value={(callStats?.total_calls ?? allTimeCalls).toLocaleString()}
          subtitle={`${t('kpi.connected', lang)}: ${(callStats?.connected ?? 0).toLocaleString()}`}
          icon={PhoneCall}
          tooltip={lang === 'th'
            ? 'จำนวนสายที่โทรออกในช่วงเวลาที่เลือก Connected = จำนวนสายที่ติดต่อได้สำเร็จ'
            : 'Total calls made in the selected period. Connected = calls with a successful connection status.'
          }
        />
        <KpiCard
          title={t('kpi.programROI', lang)}
          value={roiKpi.roi > 0 ? `${roiKpi.roi.toFixed(2)}x` : '—'}
          subtitle={t('kpi.roiMultiplier', lang)}
          valueClassName={colorRoi(roiKpi.roi)}
          icon={Calculator}
          tooltip={lang === 'th'
            ? 'HOC Sales ÷ ค่าใช้จ่ายรวม (incentive + ค่า agent) คำนวณจากข้อมูลรายเดือน — ไม่ได้รับผลกระทบจากการกรองกลุ่ม เพราะต้นทุนเป็นของทั้งโปรแกรม'
            : 'HOC Sales ÷ Total Program Expense (incentives + agent costs). Always month-level — not affected by segment filter because costs are shared across all segments.'
          }
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
