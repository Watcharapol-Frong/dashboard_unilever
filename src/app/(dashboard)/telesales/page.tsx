'use client'
import { useKpi } from '@/hooks/useKpi'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'
import { NivoLine } from '@/components/charts/NivoLine'
import { NivoBar } from '@/components/charts/NivoBar'
import { SankeyFunnel } from '@/components/charts/SankeyFunnel'
import { formatNumber, formatPct, formatPeriodLabel } from '@/lib/utils'
import { useDateRange } from '@/context/DateRangeContext'
import { Phone, UserCheck, Users, BarChart2 } from 'lucide-react'
import type { TelesalesKpi } from '@/types'

export default function TelesalesPage() {
  const { data, isLoading } = useKpi<TelesalesKpi>('/api/analytics/telesales')
  const { groupBy } = useDateRange()

  const summary = data?.summary

  // Call status bar chart data
  const callStatusBar = Object.entries(data?.callStatusMap ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([status, count]) => ({ status, count }))

  // Trend chart
  const trendData = data?.by_period?.length ? [
    { id: 'Total Calls', data: data.by_period.map(d => ({ x: formatPeriodLabel(d.period, groupBy), y: d.total_calls })) },
    { id: 'Reached',     data: data.by_period.map(d => ({ x: formatPeriodLabel(d.period, groupBy), y: d.reached })) },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Telesales Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Call statistics, agent performance, and conversion funnel</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Calls"
          value={formatNumber(summary?.total_calls ?? 0)}
          icon={Phone}
          loading={isLoading}
        />
        <KpiCard
          title="Reached (รับสาย)"
          value={formatNumber(summary?.reached ?? 0)}
          subtitle={`Reach rate: ${formatPct((summary?.reached ?? 0) / Math.max(summary?.total_calls ?? 1, 1))}`}
          icon={UserCheck}
          loading={isLoading}
        />
        <KpiCard
          title="Not Reached"
          value={formatNumber(summary?.not_reached ?? 0)}
          subtitle={`${formatPct((summary?.not_reached ?? 0) / Math.max(summary?.total_calls ?? 1, 1))} of calls`}
          icon={Users}
          loading={isLoading}
        />
        <KpiCard
          title="Status Types"
          value={String(Object.keys(data?.callStatusMap ?? {}).length)}
          subtitle="Distinct call outcomes"
          icon={BarChart2}
          loading={isLoading}
        />
      </div>

      {/* Sankey Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telesales Pipeline Funnel (Lead → Ordered)</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.sankey?.nodes?.length ? (
            <SankeyFunnel
              nodes={data.sankey.nodes}
              links={data.sankey.links as { source: string; target: string; value: number }[]}
              height={420}
            />
          ) : (
            <div className="h-96 flex items-center justify-center text-muted-foreground text-sm">
              {isLoading ? 'Loading funnel...' : 'No call data for this period'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {callStatusBar.length > 0 ? (
            <NivoBar
              data={callStatusBar}
              keys={['count']}
              indexBy="status"
              layout="horizontal"
              height={Math.max(200, callStatusBar.length * 36)}
              colors={['#003DA6']}
              valueFormat={v => formatNumber(Number(v))}
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              No data
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Call Trend</CardTitle></CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <NivoLine data={trendData} height={260} />
          ) : (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No call data</div>
          )}
        </CardContent>
      </Card>

      {/* Agent Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agent Performance</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            data={data?.by_agent ?? []}
            columns={columns}
            searchKey="agent"
          />
        </CardContent>
      </Card>
    </div>
  )
}
