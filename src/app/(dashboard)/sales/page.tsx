'use client'
import { useKpi } from '@/hooks/useKpi'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'
import { NivoLine } from '@/components/charts/NivoLine'
import { NivoBar } from '@/components/charts/NivoBar'
import { TargetGaugeBar } from '@/components/dashboard/TargetGaugeBar'
import { formatTHB, formatNumber, formatPeriodLabel, formatPct, getProgressColor, cn } from '@/lib/utils'
import { useDateRange } from '@/context/DateRangeContext'
import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react'
import type { SalesKpi } from '@/types'

export default function SalesPage() {
  const { data, isLoading } = useKpi<SalesKpi>('/api/analytics/sales')
  const { groupBy } = useDateRange()

  const lineData = data?.by_period?.length ? [
    { id: 'Online',  data: data.by_period.map(d => ({ x: formatPeriodLabel(d.period, groupBy), y: d.online })) },
    { id: 'Offline', data: data.by_period.map(d => ({ x: formatPeriodLabel(d.period, groupBy), y: d.offline })) },
  ] : []

  const barData = (data?.by_period ?? []).map(d => ({
    period:  formatPeriodLabel(d.period, groupBy),
    Online:  d.online,
    Offline: d.offline,
  }))

  return (
    <div className="space-y-6">
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Sales"
          value={formatTHB(data?.total_sales ?? 0)}
          subtitle={`Target: ${formatTHB(data?.target ?? 0)}`}
          icon={TrendingUp}
          targetPct={data?.target_pct}
          loading={isLoading}
        />
        <KpiCard
          title="Online Sales"
          value={formatTHB(data?.total_sales_online ?? 0)}
          icon={DollarSign}
          loading={isLoading}
        />
        <KpiCard
          title="Offline Sales"
          value={formatTHB(data?.total_sales_offline ?? 0)}
          icon={ShoppingBag}
          loading={isLoading}
        />
        <KpiCard
          title="New Customers"
          value={formatNumber(data?.new_customers ?? 0)}
          subtitle={`Avg order: ${formatTHB(data?.avg_order_value ?? 0)}`}
          icon={Users}
          loading={isLoading}
        />
      </div>

      {/* Target Gauges */}
      {data && (
        <Card>
          <CardHeader><CardTitle className="text-base">Target Achievement</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <TargetGaugeBar label="Total Sales (All Channels)" actual={data.total_sales} target={data.target} />
            <TargetGaugeBar label="Online Channel" actual={data.total_sales_online} target={data.target * 0.7} />
            <TargetGaugeBar label="Offline Channel" actual={data.total_sales_offline} target={data.target * 0.3} />
          </CardContent>
        </Card>
      )}

      {/* Forecast Card */}
      {data && data.month_target > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">คาดการณ์ยอดขายเดือนนี้ (Run Rate)</CardTitle>
            <p className="text-xs text-muted-foreground">
              อิงจากยอด MTD {data.days_elapsed} วัน × {data.days_in_month} วันในเดือน
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tabular-nums">{formatTHB(data.forecast)}</p>
                <p className={cn(
                  'text-sm font-semibold mt-0.5',
                  data.forecast_vs_target_pct >= 1 ? 'text-green-600' :
                  data.forecast_vs_target_pct >= 0.7 ? 'text-amber-500' : 'text-red-500'
                )}>
                  {formatPct(data.forecast_vs_target_pct)} ของเป้าหมาย
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-0.5">
                <p>MTD: {formatTHB(data.mtd_sales)}</p>
                <p>เป้าหมาย: {formatTHB(data.month_target)}</p>
              </div>
            </div>
            {/* Progress bar: MTD vs Forecast vs Target */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>MTD จริง</span>
                <span>คาดการณ์</span>
                <span>เป้าหมาย</span>
              </div>
              <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden">
                {/* MTD actual */}
                <div
                  className="absolute h-full bg-[#003DA6] rounded-full transition-all"
                  style={{ width: `${Math.min((data.mtd_sales / data.month_target) * 100, 100)}%` }}
                />
                {/* Forecast marker */}
                <div
                  className="absolute h-full w-0.5 bg-amber-400"
                  style={{ left: `${Math.min((data.forecast / data.month_target) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="text-[#003DA6] font-medium">{formatPct(data.mtd_sales / data.month_target)} ปัจจุบัน</span>
                <span className="text-amber-500 font-medium">{formatPct(data.forecast_vs_target_pct)} คาด</span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sales Trend (THB)</CardTitle></CardHeader>
        <CardContent>
          {lineData.length > 0 ? (
            <NivoLine data={lineData} height={300} enableArea />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              No sales data for this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart */}
      {barData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Online vs Offline Sales</CardTitle></CardHeader>
          <CardContent>
            <NivoBar
              data={barData}
              keys={['Online', 'Offline']}
              indexBy="period"
              height={260}
              colors={['#003DA6', '#EE2737']}
              valueFormat={v => formatTHB(Number(v))}
              groupMode="stacked"
            />
          </CardContent>
        </Card>
      )}

      {/* Recent Orders */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            data={data?.recent_orders ?? []}
            columns={columns}
            searchKey="order_number"
          />
        </CardContent>
      </Card>
    </div>
  )
}
