'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatTHB, formatNumber, colorAchievement } from '@/lib/formatters'
import { columns } from '../columns'
import { ShoppingBag, TrendingUp, CreditCard, Layers } from 'lucide-react'

interface SalesData {
  total_sales: number
  total_sales_online: number
  total_sales_offline: number
  total_orders: number
  target: number
  target_pct: number
  new_customers: number
  avg_order_value: number
  by_period: { period: string; online: number; offline: number }[]
  recent_orders: any[]
}

export default function SalesClient() {
  const { data, isLoading } = useDashboardSWR<SalesData>('/api/data/sales')

  const chartData = useMemo(() => {
    if (!data?.by_period) return []
    return data.by_period.map(p => ({
      name: new Date(p.period).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      Online: p.online,
      Offline: p.offline,
    }))
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.total_sales === 0) {
    return <PageEmpty message="No sales data available" hint="Please upload sales data and build mart." />
  }

  const onlinePct  = data.total_sales > 0 ? (data.total_sales_online  / data.total_sales) * 100 : 0
  const offlinePct = data.total_sales > 0 ? (data.total_sales_offline / data.total_sales) * 100 : 0

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Sales Revenue"
          value={formatTHB(data.total_sales)}
          subtitle={`Target: ${formatTHB(data.target)}`}
          icon={TrendingUp}
        />
        <KpiCard
          title="Target Achievement"
          value={`${(data.target_pct * 100).toFixed(1)}%`}
          subtitle={data.target_pct >= 1 ? 'Target Reached ✓' : 'Below target period'}
          valueClassName={colorAchievement(data.target_pct * 100)}
          icon={Layers}
        />
        <KpiCard
          title="Average Order Value"
          value={formatTHB(data.avg_order_value)}
          subtitle="Revenue per order"
          icon={CreditCard}
        />
        <KpiCard
          title="Total HOC Orders"
          value={formatNumber(data.total_orders)}
          subtitle={`New Customers: ${formatNumber(data.new_customers)}`}
          icon={ShoppingBag}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Sales Trend (Online vs Offline)" height={300} className="lg:col-span-2">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#003DA6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#003DA6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EE2737" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#EE2737" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS}
              tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelClassName="text-xs font-bold"
              formatter={(value: any) => [formatTHB(Number(value)), '']} />
            <Area type="monotone" dataKey="Online"  stroke="#003DA6" fillOpacity={1} fill="url(#colorOnline)"  strokeWidth={2} />
            <Area type="monotone" dataKey="Offline" stroke="#EE2737" fillOpacity={1} fill="url(#colorOffline)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col justify-center h-[300px]">
            <div className="space-y-6">
              {[
                { label: 'Online Channel',  color: '#003DA6', pct: onlinePct,  value: data.total_sales_online },
                { label: 'Offline Channel', color: '#EE2737', pct: offlinePct, value: data.total_sales_offline },
              ].map(({ label, color, pct, value }) => (
                <div key={label} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-semibold">{label}</span>
                    </div>
                    <span className="font-bold">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Revenue</span>
                    <span className="font-medium">{formatTHB(value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent HOC Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={data.recent_orders} />
        </CardContent>
      </Card>
    </div>
  )
}
