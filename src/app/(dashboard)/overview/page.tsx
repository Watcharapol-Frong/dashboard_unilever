'use client'
import { useKpi } from '@/hooks/useKpi'
import { useDateRange } from '@/context/DateRangeContext'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RadialGauge } from '@/components/dashboard/RadialGauge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NivoBar } from '@/components/charts/NivoBar'
import { NivoPie } from '@/components/charts/NivoPie'
import { formatTHB, formatNumber, formatPct, getProgressColor, formatPeriodLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { OverviewKpi, SalesKpi } from '@/types'

function cmp(current: number, prev: number) {
  if (prev === 0) return undefined
  return (current - prev) / prev
}

function StackedBar({
  segments,
  height = 20,
}: {
  segments: { value: number; color: string; label: string }[]
  height?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div style={{ height }} className="rounded-full bg-gray-100 w-full" />
  return (
    <div style={{ height }} className="flex rounded-full overflow-hidden w-full bg-gray-100">
      {segments.map((seg, i) => {
        const pct = (seg.value / total) * 100
        if (pct < 0.1) return null
        return (
          <div
            key={i}
            style={{ width: `${pct}%`, background: seg.color }}
            title={`${seg.label}: ${formatTHB(seg.value)}`}
          />
        )
      })}
    </div>
  )
}

export default function OverviewPage() {
  const { mode, groupBy } = useDateRange()
  const { data: kpi, isLoading } = useKpi<OverviewKpi>('/api/kpi/overview')
  const { data: sales } = useKpi<SalesKpi>('/api/kpi/sales')

  const comparisonLabel =
    mode === 'month' ? 'vs last month' :
    mode === 'week'  ? 'vs last week'  : 'vs prev period'

  const barData = (sales?.by_period ?? []).map(d => ({
    period:  formatPeriodLabel(d.period, groupBy),
    Online:  d.online,
    Offline: d.offline,
  }))

  // Call status pie from real Thai statuses
  const callPie = Object.entries(kpi?.callStatusMap ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([status, value]) => ({ id: status, label: status, value }))

  // Channel pie
  const channelPie = kpi ? [
    { id: 'Online',  label: 'Online',  value: kpi.total_sales_online },
    { id: 'Offline', label: 'Offline', value: kpi.total_sales_offline },
  ] : []

  // Target gauge segments
  const target       = kpi?.sales_target ?? 0
  const onlineActual  = kpi?.total_sales_online  ?? 0
  const offlineActual = kpi?.total_sales_offline ?? 0
  const totalActual   = onlineActual + offlineActual

  const onlinePct  = target > 0 ? Math.min(onlineActual  / target, 1) : 0
  const offlinePct = target > 0 ? Math.min(offlineActual / target, 1) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Unilever Project Summary</p>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="New Customers"
          value={formatNumber(kpi?.new_customers ?? 0)}
          comparison={cmp(kpi?.new_customers ?? 0, kpi?.prev_new_customers ?? 0)}
          comparisonLabel={comparisonLabel}
          extras={[
            { label: 'Per day', value: `${(kpi?.new_customers_per_day ?? 0).toFixed(1)} / day` },
          ]}
          loading={isLoading}
        />
        <KpiCard
          title="Total Sales"
          value={formatTHB(kpi?.total_sales ?? 0)}
          comparison={cmp(kpi?.total_sales ?? 0, kpi?.prev_total_sales ?? 0)}
          comparisonLabel={comparisonLabel}
          extras={[
            { label: 'Orders', value: formatNumber(kpi?.order_count ?? 0) },
            { label: 'AOV', value: formatTHB(kpi?.aov ?? 0) },
          ]}
          loading={isLoading}
        />
        <KpiCard
          title="Total Calls"
          value={formatNumber(kpi?.total_calls ?? 0)}
          comparison={cmp(kpi?.total_calls ?? 0, kpi?.prev_total_calls ?? 0)}
          comparisonLabel={comparisonLabel}
          extras={[
            { label: 'Per day', value: `${(kpi?.calls_per_day ?? 0).toFixed(1)} / day` },
            { label: 'Reach rate', value: formatPct(kpi?.connection_rate ?? 0) },
          ]}
          loading={isLoading}
        />
        <KpiCard
          title="Reach Rate"
          value={formatPct(kpi?.connection_rate ?? 0)}
          comparison={cmp(kpi?.connection_rate ?? 0, kpi?.prev_connection_rate ?? 0)}
          comparisonLabel={comparisonLabel}
          extras={[
            { label: 'Reached (รับสาย)', value: formatNumber(kpi?.contacted ?? 0) },
            { label: 'Not reached', value: formatNumber(kpi?.not_reached ?? 0) },
          ]}
          loading={isLoading}
        />
      </div>

      {/* Sales Target Achievement */}
      {kpi && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales Target Achievement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Radial Donut */}
              <RadialGauge
                online={onlineActual}
                offline={offlineActual}
                target={target}
                height={220}
              />

              {/* Stacked bar breakdown */}
              <div className="space-y-5">
                {/* Legend */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block bg-[#003DA6]" />Online
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block bg-[#EE2737]" />Offline
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block bg-gray-200" />Remaining
                  </span>
                </div>

                {/* Total stacked bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Total</span>
                    <span>{formatTHB(totalActual)} / {formatTHB(target)}</span>
                  </div>
                  <StackedBar
                    height={18}
                    segments={[
                      { value: onlineActual,  color: '#003DA6', label: 'Online' },
                      { value: offlineActual, color: '#EE2737', label: 'Offline' },
                      { value: Math.max(0, target - totalActual), color: '#e5e7eb', label: 'Remaining' },
                    ]}
                  />
                  <p className={cn('text-xs font-semibold', target > 0 ? (
                    (kpi.target_pct ?? 0) >= 0.9 ? 'text-green-600' :
                    (kpi.target_pct ?? 0) >= 0.7 ? 'text-amber-500' : 'text-red-500'
                  ) : 'text-muted-foreground')}>
                    {formatPct(kpi.target_pct ?? 0)} of target
                  </p>
                </div>

                {/* Online bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Online</span>
                    <span>{formatTHB(onlineActual)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', getProgressColor(onlinePct))}
                      style={{ width: `${Math.min(onlinePct * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPct(onlinePct)} of target</p>
                </div>

                {/* Offline bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Offline</span>
                    <span>{formatTHB(offlineActual)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', getProgressColor(offlinePct))}
                      style={{ width: `${Math.min(offlinePct * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPct(offlinePct)} of target</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Trend — Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales Trend (THB)</CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length > 0 ? (
            <NivoBar
              data={barData}
              keys={['Online', 'Offline']}
              indexBy="period"
              groupMode="stacked"
              height={280}
              colors={['#003DA6', '#EE2737']}
              valueFormat={v => formatTHB(Number(v))}
              tickRotation={-45}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              No sales data for this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <NivoPie data={channelPie} height={180} legend={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <NivoPie data={callPie} height={180} legend={false} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
