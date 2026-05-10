'use client'
import { useKpi } from '@/hooks/useKpi'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { NivoLine } from '@/components/charts/NivoLine'
import { NivoPie } from '@/components/charts/NivoPie'
import { SankeyFunnel } from '@/components/charts/SankeyFunnel'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatPct } from '@/lib/utils'
import { Phone, UserCheck, ThumbsUp, ShoppingBag } from 'lucide-react'
import type { TelesalesKpi, AgentPerformance } from '@/types'

export default function TelesalesPage() {
  const { data, isLoading } = useKpi<TelesalesKpi>('/api/kpi/telesales')

  const summary = data?.summary
  const callPie = summary ? [
    { id: 'Contacted', label: 'Contacted', value: summary.contacted },
    { id: 'No Answer', label: 'No Answer', value: summary.no_answer },
    { id: 'Interested', label: 'Interested', value: summary.interested },
    { id: 'Not Interested', label: 'Not Interested', value: summary.not_interested },
    { id: 'Ordered', label: 'Ordered', value: summary.ordered },
  ].filter(d => d.value > 0) : []

  const trendData = data?.by_date?.length ? [
    { id: 'Total Calls', data: data.by_date.map(d => ({ x: d.date, y: d.total_calls })) },
    { id: 'Contacted', data: data.by_date.map(d => ({ x: d.date, y: d.contacted })) },
  ] : []

  const agentColumns = [
    { key: 'agent_name', header: 'Agent', sortable: true },
    { key: 'agent_company', header: 'Company', render: (r: AgentPerformance) => r.agent_company ?? '-' },
    { key: 'total_calls', header: 'Calls', sortable: true, align: 'right' as const, render: (r: AgentPerformance) => formatNumber(r.total_calls) },
    { key: 'contacted', header: 'Contacted', sortable: true, align: 'right' as const, render: (r: AgentPerformance) => formatNumber(r.contacted) },
    { key: 'interested', header: 'Interested', sortable: true, align: 'right' as const, render: (r: AgentPerformance) => formatNumber(r.interested) },
    { key: 'ordered', header: 'Ordered', sortable: true, align: 'right' as const, render: (r: AgentPerformance) => formatNumber(r.ordered) },
    {
      key: 'connection_rate', header: 'Connection Rate', sortable: true, align: 'right' as const,
      render: (r: AgentPerformance) => (
        <Badge variant={r.connection_rate >= 0.7 ? 'success' : r.connection_rate >= 0.5 ? 'warning' : 'destructive'}>
          {formatPct(r.connection_rate)}
        </Badge>
      )
    },
    {
      key: 'conversion_rate', header: 'Conversion Rate', sortable: true, align: 'right' as const,
      render: (r: AgentPerformance) => (
        <Badge variant={r.conversion_rate >= 0.3 ? 'success' : r.conversion_rate >= 0.15 ? 'warning' : 'destructive'}>
          {formatPct(r.conversion_rate)}
        </Badge>
      )
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Telesales Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Call statistics, agent performance, and conversion funnel</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Calls" value={formatNumber(summary?.total_calls ?? 0)} icon={Phone} loading={isLoading} />
        <KpiCard title="Contacted" value={formatNumber(summary?.contacted ?? 0)} subtitle={`Connection rate: ${formatPct((summary?.contacted ?? 0) / Math.max(summary?.total_calls ?? 1, 1))}`} icon={UserCheck} loading={isLoading} />
        <KpiCard title="Interested" value={formatNumber(summary?.interested ?? 0)} subtitle={`Conversion: ${formatPct((summary?.interested ?? 0) / Math.max(summary?.contacted ?? 1, 1))}`} icon={ThumbsUp} loading={isLoading} />
        <KpiCard title="Ordered" value={formatNumber(summary?.ordered ?? 0)} subtitle="Placed an order after call" icon={ShoppingBag} loading={isLoading} />
      </div>

      {/* Sankey Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telesales Pipeline Funnel (Lead → First Purchase)</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.sankey ? (
            <SankeyFunnel nodes={data.sankey.nodes} links={data.sankey.links as { source: string; target: string; value: number }[]} height={420} />
          ) : (
            <div className="h-96 flex items-center justify-center text-muted-foreground text-sm">Loading funnel...</div>
          )}
        </CardContent>
      </Card>

      {/* Trend + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Daily Call Trend</CardTitle></CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <NivoLine data={trendData} height={260} />
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No call data</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Call Outcome Distribution</CardTitle></CardHeader>
          <CardContent>
            <NivoPie data={callPie} height={260} legend={false} />
          </CardContent>
        </Card>
      </div>

      {/* Agent Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agent Performance</CardTitle></CardHeader>
        <CardContent>
          <DataTable data={(data?.by_agent ?? []) as unknown as Record<string, unknown>[]} columns={agentColumns as never} />
        </CardContent>
      </Card>
    </div>
  )
}
