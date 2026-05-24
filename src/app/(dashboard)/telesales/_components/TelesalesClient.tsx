'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatNumber, formatPct, colorRate } from '@/lib/formatters'
import { columns } from '../columns'
import { Phone, PhoneCall, UserCheck, Users } from 'lucide-react'

interface AgentPerformance {
  agent: string
  total_calls: number
  reached: number
  not_reached: number
  reach_rate: number
  conversion_rate: number
  calls_per_day: number
}

interface TelesalesData {
  summary: {
    total_calls: number
    reached: number
    not_reached: number
    call_status_breakdown: Record<string, number>
  }
  by_agent: AgentPerformance[]
  by_period: { period: string; total_calls: number; reached: number }[]
}

export default function TelesalesClient() {
  const { data, isLoading } = useDashboardSWR<TelesalesData>('/api/data/telesales')

  const trendData = useMemo(() => {
    if (!data?.by_period) return []
    return data.by_period.map(p => ({
      name: new Date(p.period).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      Calls: p.total_calls,
      Reached: p.reached,
    }))
  }, [data])

  const statusData = useMemo(() => {
    if (!data?.summary.call_status_breakdown) return []
    return Object.entries(data.summary.call_status_breakdown)
      .map(([status, count]) => ({ status: status || 'Unspecified', Count: count }))
      .slice(0, 8)
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.summary.total_calls === 0) {
    return <PageEmpty message="No telesales data available" hint="Please upload telesales data and build mart." />
  }

  const reachRate = data.summary.total_calls > 0 ? data.summary.reached / data.summary.total_calls : 0
  const activeAgents = data.by_agent.filter(a => a.total_calls > 0).length
  const totalReached = data.by_agent.reduce((sum, a) => sum + a.reached, 0)
  const totalConverted = data.by_agent.reduce((sum, a) => sum + a.reached * a.conversion_rate, 0)
  const conversionRate = totalReached > 0 ? totalConverted / totalReached : 0

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Telesales Calls"
          value={formatNumber(data.summary.total_calls)}
          subtitle={`Not Connected: ${formatNumber(data.summary.not_reached)}`}
          icon={Phone}
        />
        <KpiCard
          title="Connected Rate"
          value={formatPct(reachRate)}
          subtitle="Calls successfully reached"
          valueClassName={colorRate(reachRate)}
          icon={PhoneCall}
        />
        <KpiCard
          title="Conversion Rate"
          value={formatPct(conversionRate)}
          subtitle="Orders / Connected leads"
          valueClassName={colorRate(conversionRate, [0.15, 0.08])}
          icon={UserCheck}
        />
        <KpiCard
          title="Active Agents"
          value={formatNumber(activeAgents)}
          subtitle="Total calling agents"
          icon={Users}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Daily Calling Trend (Calls vs Reached)" height={300} className="lg:col-span-2">
          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorReached" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelClassName="text-xs font-bold" />
            <Area type="monotone" dataKey="Calls" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={2} />
            <Area type="monotone" dataKey="Reached" stroke="#10b981" fillOpacity={1} fill="url(#colorReached)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Top Call Statuses" height={300}>
          <BarChart data={statusData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
            <XAxis type="number" tickLine={false} axisLine={false} className={CHART_AXIS_CLS} />
            <YAxis dataKey="status" type="category" tickLine={false} axisLine={false} className={CHART_AXIS_CLS} width={80} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelClassName="text-xs font-bold" />
            <Bar dataKey="Count" fill="#003DA6" radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Agent Performance Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={data.by_agent} />
        </CardContent>
      </Card>
    </div>
  )
}
