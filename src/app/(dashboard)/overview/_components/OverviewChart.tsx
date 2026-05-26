'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid,
} from 'recharts'
import {
  ChartContainer, ChartTooltip, type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fmtBaht, fmt } from '@/lib/formatters'
import { CustomerTrendChart } from '@/components/dashboard/CustomerTrendChart'

// ── Chart Config ──────────────────────────────────────────────────────────────

const salesChartConfig = {
  online_sales:  { label: 'Online Sales',  color: '#3b82f6' },
  offline_sales: { label: 'Offline Sales', color: '#10b981' },
  sales_target:  { label: 'Target',        color: '#e2e8f0' },
  achievement:   { label: 'Achievement',   color: '#f59e0b' },
} satisfies ChartConfig

// ── Sales Tooltip ─────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

function SalesTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  const onlineSales  = Number(data.online_sales ?? 0)
  const offlineSales = Number(data.offline_sales ?? 0)
  const totalSales   = onlineSales + offlineSales
  const target       = Number(data.sales_target ?? 0)
  const achievement  = Number(data.achievement ?? 0)

  return (
    <div className="rounded-lg border border-border/50 bg-background p-3 text-xs shadow-xl min-w-[12rem] space-y-2">
      <div className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className="space-y-0.5">
        <div className="text-[10px] text-muted-foreground">Total Sales</div>
        <div className="text-base font-bold text-foreground">{fmtBaht(totalSales)}</div>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.online_sales.color }} />
            <span>Online Sales</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">{fmtBaht(onlineSales)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.offline_sales.color }} />
            <span>Offline Sales</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">{fmtBaht(offlineSales)}</span>
        </div>
      </div>
      <hr className="border-t border-border/80 border-dashed my-1.5" />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-gray-300" style={{ backgroundColor: salesChartConfig.sales_target.color }} />
            <span>Target</span>
          </div>
          <span className="font-semibold tabular-nums text-foreground">{target > 0 ? fmtBaht(target) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.achievement.color }} />
            <span>Achievement</span>
          </div>
          <span className="font-semibold tabular-nums text-amber-600">{achievement.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OverviewChartProps {
  byMonth: {
    month_label: string
    online_sales: number
    offline_sales: number
    sales_target: number
    achievement: number
    hoc_sales: number
  }[]
  kpi: {
    hoc_sales: number
    sales_target: number
    achievement: number
  }
  filterCmg?: string[]
  filterChannel?: string
  startDate?: string | null
  endDate?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OverviewChart({ byMonth, kpi, filterCmg, filterChannel, startDate, endDate }: OverviewChartProps) {
  return (
    <div className="space-y-6">
      {/* HOC Sales vs Target */}
      <Card className="w-full py-6 gap-8 shadow-xs border">
        <CardHeader className="flex sm:flex-row flex-col justify-between sm:items-center items-start gap-3 px-6">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg font-medium">HOC Sales vs Target Trend</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-3xl font-semibold text-card-foreground">
                {fmtBaht(kpi.hoc_sales)}
              </h3>
              <Badge
                className={cn(
                  kpi.achievement >= 100 ? 'bg-green-50 text-green-600 border-green-200'
                    : kpi.achievement >= 80 ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                    : 'bg-red-50 text-red-500 border-red-200',
                  'shadow-none border font-semibold px-2 py-0.5'
                )}
                variant="outline"
              >
                {kpi.achievement.toFixed(1)}%
              </Badge>
              <span className="text-xs text-muted-foreground">
                of target ({fmtBaht(kpi.sales_target)})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.online_sales.color }} />
              <p className="text-sm text-muted-foreground">Online Sales</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-black/5" style={{ backgroundColor: salesChartConfig.offline_sales.color }} />
              <p className="text-sm text-muted-foreground">Offline Sales</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-gray-300" style={{ backgroundColor: salesChartConfig.sales_target.color }} />
              <p className="text-sm text-muted-foreground">Target</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5" style={{ backgroundColor: salesChartConfig.achievement.color }} />
              <p className="text-sm text-muted-foreground">Achievement</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6">
          <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
            <ComposedChart data={byMonth} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(144, 164, 174, 0.3)" />
              <XAxis dataKey="month_label" tickLine={false} tickMargin={10} axisLine={false} fontSize={12} />
              <YAxis yAxisId="sales" tickFormatter={fmt} tickLine={false} axisLine={false} tickMargin={10} fontSize={12} width={50} />
              <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} tickMargin={10} fontSize={12} width={40} />
              <ChartTooltip cursor={false} content={<SalesTooltip />} />
              <Bar yAxisId="sales" dataKey="offline_sales" name="Offline Sales" fill="var(--color-offline_sales)" stackId="sales" radius={[0, 0, 0, 0]} barSize={48} />
              <Bar yAxisId="sales" dataKey="online_sales"  name="Online Sales"  fill="var(--color-online_sales)"  stackId="sales" radius={[4, 4, 0, 0]} barSize={48} />
              <Bar yAxisId="sales" dataKey="sales_target"  name="Target"        fill="var(--color-sales_target)"  radius={[4, 4, 0, 0]} barSize={48} />
              <Line yAxisId="pct" dataKey="achievement" name="Achievement" type="monotone" stroke="var(--color-achievement)" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* New & Reactivated Customers Trend */}
      <CustomerTrendChart
        filterCmg={filterCmg}
        filterChannel={filterChannel}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  )
}
