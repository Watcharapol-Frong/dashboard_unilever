'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatTHB, formatPeriodLabel, colorAchievement, colorRoi } from '@/lib/formatters'
import { PiggyBank, TrendingUp, Info } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const DISTRIBUTOR_EXCLUDED_FROM = '2025-05-01'

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
  incentive_hoc_sales: number
  sales_target: number
  incentive_per_head: number
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

const summaryColumns: ColumnDef<MonthlySummary>[] = [
  {
    accessorKey: 'month',
    header: 'Month',
    cell: ({ row }) => {
      const isExcluded = row.original.month >= DISTRIBUTOR_EXCLUDED_FROM
      return (
        <div className="flex items-center gap-1.5">
          <span>{formatPeriodLabel(row.original.month, 'month')}</span>
          {isExcluded && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-amber-500 cursor-default shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] text-xs">
                  DISTRIBUTOR CMG is excluded from HOC Sales, Achievement %, Incentive, and ROI calculations from May 2025 onwards.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'incentive_hoc_sales',
    header: 'HOC Sales',
    cell: ({ row }) => (
      <div className="text-right font-medium">{formatTHB(row.original.incentive_hoc_sales)}</div>
    ),
  },
  {
    accessorKey: 'achievement_ratio',
    header: 'Achievement',
    cell: ({ row }) => (
      <span className={`font-semibold transition-colors ${colorAchievement(row.original.achievement_ratio)}`}>
        {row.original.achievement_ratio.toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: 'incentive_per_head',
    header: 'Rate / Head',
    cell: ({ row }) => (
      <div className="text-right font-medium text-muted-foreground">
        {row.original.incentive_per_head > 0 ? `${formatTHB(row.original.incentive_per_head)}/head` : '—'}
      </div>
    ),
  },
  {
    accessorKey: 'total_incentive',
    header: 'Total Incentives Paid',
    cell: ({ row }) => <div className="text-right font-medium">{formatTHB(row.original.total_incentive)}</div>,
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
      Incentive: m.total_incentive,
      ROI: m.roi,
    }))
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.monthly_summary.length === 0) {
    return <PageEmpty message="No incentive data available" hint="Please upload agent headcounts, costs, targets & incentives data and rebuild mart." />
  }

  const totalIncentive = data.monthly_summary.reduce((sum, m) => sum + m.total_incentive,      0)
  const totalExpense   = data.monthly_summary.reduce((sum, m) => sum + m.total_expense,         0)
  const totalSales     = data.monthly_summary.reduce((sum, m) => sum + m.incentive_hoc_sales,   0)
  const grandRoi       = totalExpense > 0 ? totalSales / totalExpense : 0

  return (
    <div className="space-y-6">
      <KpiGrid cols={2}>
        <KpiCard
          title="Total Incentives Paid"
          value={formatTHB(totalIncentive)}
          subtitle="Agent performance bonus"
          icon={PiggyBank}
          tooltip="Total incentive payout to agents — calculated as agent headcount × incentive rate per head. Rate is determined by the monthly achievement tier (FOOD RETAILER + HORECA sales vs target)."
        />
        <KpiCard
          title="Overall Program ROI"
          value={grandRoi > 0 ? `${grandRoi.toFixed(2)}x` : '—'}
          subtitle="Unilever HOC sales / Expense"
          valueClassName={colorRoi(grandRoi)}
          icon={TrendingUp}
          tooltip="HOC Sales ÷ Total Program Expense across all displayed months. Total Expense = incentives + agent salaries + supervisor salaries. A value of 2.0x means every ฿1 spent returns ฿2 in HOC sales."
        />
      </KpiGrid>

      <ChartCard title="Monthly Incentives vs Program ROI" height={300}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144,164,174,0.3)" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
          <YAxis yAxisId="incentive" tickLine={false} axisLine={false} tickMargin={8} fontSize={11}
            tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
          <YAxis yAxisId="roi" orientation="right" tickLine={false} axisLine={false} tickMargin={8} fontSize={11}
            tickFormatter={v => `${v}x`} />
          <RechartsTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl space-y-1.5 min-w-[12rem]">
                  <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
                  {payload.map(p => (
                    <div key={p.dataKey} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span>{p.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-foreground">
                        {p.dataKey === 'ROI' ? `${Number(p.value).toFixed(2)}x` : formatTHB(Number(p.value))}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          <Bar yAxisId="incentive" dataKey="Incentive" name="Total Incentives Paid" fill="#003DA6" radius={[4, 4, 0, 0]} barSize={24} />
          <Line yAxisId="roi" type="monotone" dataKey="ROI" name="ROI (Multiplier)" stroke="#EE2737" strokeWidth={3} dot={{ r: 4 }} />
        </ComposedChart>
      </ChartCard>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex flex-wrap gap-2">
              <TabsTrigger value="summary">Monthly Incentive Summary</TabsTrigger>
              <TabsTrigger value="tiers">Incentive Tier Configuration</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="pt-2">
              <DataTable columns={summaryColumns} data={data.monthly_summary} />
            </TabsContent>
            <TabsContent value="tiers" className="pt-2">
              <DataTable columns={tierColumns} data={data.incentive_tiers} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
