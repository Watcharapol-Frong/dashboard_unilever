'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { ShoppingCart, Users, UserCheck, Target, TrendingUp, PhoneCall } from 'lucide-react'

import { useDashboardSWR }  from '@/hooks/useDashboardSWR'
import { KpiCard }          from '@/components/dashboard/KpiCard'
import { KpiGrid }          from '@/components/dashboard/KpiGrid'
import { FilterBar }        from '@/components/dashboard/FilterBar'
import { FilterSelect }     from '@/components/dashboard/FilterSelect'
import { PageLoading, PageEmpty, PageError } from '@/components/dashboard/PageState'
import { fmtBaht, fmt, fmtPct, colorAchievement, colorRoi } from '@/lib/formatters'

const SalesChart = dynamic(() => import('./SalesChart'), { ssr: false })

type Row = {
  month: string
  month_label: string
  dynamic_cmg: string
  total_calls: number
  reached: number
  ordered: number
  new_customers: number
  retention: number
  hoc_orders: number
  hoc_sales: number
  sales_target: number
  achievement_ratio: number
  total_expense: number
  roi: number
  online_sales: number
  offline_sales: number
}

type ApiData = {
  rows: Row[]
  all_time_calls: number
}

export function DashboardClient() {
  const { data, isLoading, error } = useDashboardSWR<ApiData>('/api/data/dashboard')
  const [cmg, setCmg] = useState('all')

  const cmgOptions = useMemo(() => {
    if (!data) return []
    const names = [...new Set(data.rows.map(r => r.dynamic_cmg).filter(Boolean))].sort()
    return names.map(c => ({ value: c, label: c }))
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    return cmg === 'all' ? data.rows : data.rows.filter(r => r.dynamic_cmg === cmg)
  }, [data, cmg])

  const kpi = useMemo(() => {
    const sales     = filtered.reduce((s, r) => s + r.hoc_sales, 0)
    const target    = filtered.reduce((s, r) => s + r.sales_target, 0)
    const orders    = filtered.reduce((s, r) => s + r.hoc_orders, 0)
    const newCust   = filtered.reduce((s, r) => s + r.new_customers, 0)
    const retention = filtered.reduce((s, r) => s + r.retention, 0)
    const expense   = filtered.reduce((s, r) => s + r.total_expense, 0)
    const achievement = target > 0 ? sales / target : 0
    const roi         = expense > 0 ? sales / expense : 0
    return { sales, target, orders, newCust, retention, expense, achievement, roi }
  }, [filtered])

  const chartData = useMemo(() => {
    const byMonth = new Map<string, { label: string; sales: number; target: number }>()
    for (const r of filtered) {
      const cur = byMonth.get(r.month) ?? { label: r.month_label, sales: 0, target: 0 }
      cur.sales  += r.hoc_sales
      cur.target += r.sales_target
      byMonth.set(r.month, cur)
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
  }, [filtered])

  if (isLoading && !data) return <PageLoading cols={3} />
  if (error) return <PageError message={error.message} />
  if (!data || data.rows.length === 0) {
    return <PageEmpty message="No data available" hint="Run Build Mart in Data Hub first" />
  }

  return (
    <div className="space-y-5">
      <FilterBar hasFilter={cmg !== 'all'} onClear={() => setCmg('all')}>
        <FilterSelect
          label="All CMGs"
          value={cmg}
          onChange={setCmg}
          options={cmgOptions}
        />
      </FilterBar>

      <KpiGrid cols={3}>
        <KpiCard
          title="HOC Sales"
          value={fmtBaht(kpi.sales)}
          icon={ShoppingCart}
          subtitle={`Target ${fmtBaht(kpi.target)}`}
        />
        <KpiCard
          title="Achievement"
          value={fmtPct(kpi.sales, kpi.target)}
          icon={Target}
          valueClassName={colorAchievement(kpi.achievement * 100)}
          subtitle={`of ฿${fmt(kpi.target)} target`}
        />
        <KpiCard
          title="ROI"
          value={kpi.roi > 0 ? `${kpi.roi.toFixed(1)}×` : '—'}
          icon={TrendingUp}
          valueClassName={colorRoi(kpi.roi)}
          subtitle={`฿${fmt(kpi.expense)} total expense`}
        />
        <KpiCard
          title="New Customers"
          value={fmt(kpi.newCust)}
          icon={Users}
          subtitle="converted in attribution window"
        />
        <KpiCard
          title="Retention"
          value={fmt(kpi.retention)}
          icon={UserCheck}
          subtitle={`${fmtPct(kpi.retention, kpi.newCust + kpi.retention)} of converted`}
        />
        <KpiCard
          title="HOC Orders"
          value={fmt(kpi.orders)}
          icon={ShoppingCart}
          subtitle={`${fmt(data.all_time_calls)} total leads called`}
        />
      </KpiGrid>

      <SalesChart data={chartData} />
    </div>
  )
}
