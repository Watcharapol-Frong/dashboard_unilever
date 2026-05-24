'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { formatTHB, formatNumber, formatPeriodLabel } from '@/lib/utils'
import { PiggyBank, Briefcase, Calculator, TrendingUp } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface IncentiveTier {
  tier: number
  incentive_per_head: number
}

interface HeadcountCost {
  month: string
  cost_per_agent: number
  cost_per_supervisor: number
  supervisor_count: number
  agent_count: number
}

interface MonthlySummary {
  month: string
  total_incentive: number
  total_agent_cost: number
  total_expense: number
  roi: number
  achievement_ratio: number
  hoc_sales: number
  sales_target: number
}

interface IncentivesKpi {
  incentive_tiers: IncentiveTier[]
  headcount_costs: HeadcountCost[]
  monthly_summary: MonthlySummary[]
}

const tierColumns: ColumnDef<IncentiveTier>[] = [
  {
    accessorKey: 'tier',
    header: 'Achievement Tier (%)',
    cell: ({ row }) => <span className="font-semibold">{(row.original.tier * 100).toFixed(0)}%</span>,
  },
  {
    accessorKey: 'incentive_per_head',
    header: 'Incentive Per Head (THB)',
    cell: ({ row }) => <div className="font-medium">{formatTHB(row.original.incentive_per_head)}</div>,
  },
]

const headcountColumns: ColumnDef<HeadcountCost>[] = [
  {
    accessorKey: 'month',
    header: 'Month',
    cell: ({ row }) => formatPeriodLabel(row.original.month, 'month'),
  },
  {
    accessorKey: 'agent_count',
    header: 'Agents',
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.agent_count)}</div>,
  },
  {
    accessorKey: 'cost_per_agent',
    header: 'Cost Per Agent',
    cell: ({ row }) => <div className="text-right">{formatTHB(row.original.cost_per_agent)}</div>,
  },
  {
    accessorKey: 'supervisor_count',
    header: 'Supervisors',
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.supervisor_count)}</div>,
  },
  {
    accessorKey: 'cost_per_supervisor',
    header: 'Cost Per Supervisor',
    cell: ({ row }) => <div className="text-right">{formatTHB(row.original.cost_per_supervisor)}</div>,
  },
]

const summaryColumns: ColumnDef<MonthlySummary>[] = [
  {
    accessorKey: 'month',
    header: 'Month',
    cell: ({ row }) => formatPeriodLabel(row.original.month, 'month'),
  },
  {
    accessorKey: 'achievement_ratio',
    header: 'Sales Achievement',
    cell: ({ row }) => (
      <span className={row.original.achievement_ratio >= 100 ? 'text-green-600 font-semibold' : row.original.achievement_ratio >= 80 ? 'text-yellow-600 font-semibold' : 'text-red-500 font-semibold'}>
        {row.original.achievement_ratio.toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: 'total_incentive',
    header: 'Total Incentives Paid',
    cell: ({ row }) => <div className="text-right font-medium">{formatTHB(row.original.total_incentive)}</div>,
  },
  {
    accessorKey: 'total_agent_cost',
    header: 'Total Agent Costs',
    cell: ({ row }) => <div className="text-right">{formatTHB(row.original.total_agent_cost)}</div>,
  },
  {
    accessorKey: 'total_expense',
    header: 'Total Expense',
    cell: ({ row }) => <div className="text-right font-bold">{formatTHB(row.original.total_expense)}</div>,
  },
  {
    accessorKey: 'roi',
    header: 'ROI',
    cell: ({ row }) => (
      <div className="text-right font-semibold">
        {row.original.roi > 0 ? `${row.original.roi.toFixed(2)}x` : '—'}
      </div>
    ),
  },
]

export default function IncentivesClient() {
  const { data, isLoading } = useDashboardSWR<IncentivesKpi>('/api/data/incentives')
  const [activeTab, setActiveTab] = useState('summary')

  const chartData = useMemo(() => {
    if (!data?.monthly_summary) return []
    return [...data.monthly_summary].reverse().map(m => ({
      name: new Date(m.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      Expense: m.total_expense,
      ROI: m.roi,
    }))
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.monthly_summary.length === 0) {
    return <PageEmpty message="No incentive data available" hint="Please upload agent headcounts, costs, targets & incentives data and rebuild mart." />
  }

  // Calculate grand totals across all months
  const totalIncentive = data.monthly_summary.reduce((sum, m) => sum + m.total_incentive, 0)
  const totalAgentCost = data.monthly_summary.reduce((sum, m) => sum + m.total_agent_cost, 0)
  const totalExpense = data.monthly_summary.reduce((sum, m) => sum + m.total_expense, 0)
  const totalSales = data.monthly_summary.reduce((sum, m) => sum + m.hoc_sales, 0)
  const grandRoi = totalExpense > 0 ? (totalSales / totalExpense) : 0

  return (
    <div className="space-y-6">
      {/* Incentives KPIs */}
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Incentives Paid"
          value={formatTHB(totalIncentive)}
          subtitle="Agent performance bonus"
          icon={PiggyBank}
        />
        <KpiCard
          title="Total Headcount Cost"
          value={formatTHB(totalAgentCost)}
          subtitle="Agent & supervisor salaries"
          icon={Briefcase}
        />
        <KpiCard
          title="Total Operation Expense"
          value={formatTHB(totalExpense)}
          subtitle="Incentive + Headcount cost"
          icon={Calculator}
        />
        <KpiCard
          title="Overall Program ROI"
          value={grandRoi > 0 ? `${grandRoi.toFixed(2)}x` : '—'}
          subtitle="Unilever HOC sales / Expense"
          valueClassName={grandRoi >= 10 ? 'text-green-600' : grandRoi >= 5 ? 'text-yellow-600' : 'text-red-500'}
          icon={TrendingUp}
        />
      </KpiGrid>

      {/* Expense vs ROI Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Monthly Expense vs Program ROI</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground font-medium" />
                <YAxis yAxisId="expense" tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground font-medium" tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="roi" orientation="right" tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground font-medium" tickFormatter={(v) => `${v}x`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: 'hsl(var(--radius))' }}
                  labelClassName="text-xs font-bold"
                />
                <Legend verticalAlign="top" height={36} iconType="circle" className="text-xs" />
                <Bar yAxisId="expense" dataKey="Expense" name="Total Expense" fill="#003DA6" radius={[4, 4, 0, 0]} barSize={24} />
                <Line yAxisId="roi" type="monotone" dataKey="ROI" name="ROI (Multiplier)" stroke="#EE2737" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabs and Data Tables */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex flex-wrap gap-2">
              <TabsTrigger value="summary">Monthly Expense Summary</TabsTrigger>
              <TabsTrigger value="headcount">Headcount & Salary History</TabsTrigger>
              <TabsTrigger value="tiers">Incentive Tier Configuration</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="pt-2">
              <DataTable
                columns={summaryColumns}
                data={data.monthly_summary}
              />
            </TabsContent>
            <TabsContent value="headcount" className="pt-2">
              <DataTable
                columns={headcountColumns}
                data={data.headcount_costs}
              />
            </TabsContent>
            <TabsContent value="tiers" className="pt-2">
              <DataTable
                columns={tierColumns}
                data={data.incentive_tiers}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
