'use client'
import { useKpi } from '@/hooks/useKpi'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { NivoLine } from '@/components/charts/NivoLine'
import { NivoBar } from '@/components/charts/NivoBar'
import { TargetGaugeBar } from '@/components/dashboard/TargetGaugeBar'
import { Badge } from '@/components/ui/badge'
import { formatTHB, formatNumber, formatDate } from '@/lib/utils'
import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react'
import type { SalesKpi, RecentOrder } from '@/types'

export default function SalesPage() {
  const { data, isLoading } = useKpi<SalesKpi>('/api/kpi/sales')

  const lineData = data?.by_date?.length ? [
    { id: 'Online', data: data.by_date.map(d => ({ x: d.date, y: d.online })) },
    { id: 'Offline', data: data.by_date.map(d => ({ x: d.date, y: d.offline })) },
  ] : []

  const barData = data?.by_date?.slice(-14) ?? []

  const orderColumns = [
    { key: 'order_date', header: 'Date', sortable: true, render: (r: RecentOrder) => formatDate(r.order_date) },
    { key: 'order_id', header: 'Order ID' },
    { key: 'customer_name', header: 'Customer', render: (r: RecentOrder) => r.customer_name ?? '-' },
    { key: 'product_sku', header: 'SKU' },
    { key: 'product_brand', header: 'Brand', render: (r: RecentOrder) => r.product_brand ?? '-' },
    { key: 'qty', header: 'Qty', align: 'right' as const, render: (r: RecentOrder) => formatNumber(r.qty) },
    { key: 'sales_amount', header: 'Amount', sortable: true, align: 'right' as const, render: (r: RecentOrder) => formatTHB(r.sales_amount) },
    {
      key: 'channel', header: 'Channel', align: 'center' as const,
      render: (r: RecentOrder) => <Badge variant={r.channel === 'online' ? 'default' : 'secondary'}>{r.channel}</Badge>
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Revenue tracking, target achievement, and order details</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Sales" value={formatTHB(data?.total_sales ?? 0)} subtitle={`Target: ${formatTHB(data?.target ?? 0)}`} icon={TrendingUp} targetPct={data?.target_pct} loading={isLoading} />
        <KpiCard title="Online Sales" value={formatTHB(data?.total_sales_online ?? 0)} icon={DollarSign} loading={isLoading} />
        <KpiCard title="Offline Sales" value={formatTHB(data?.total_sales_offline ?? 0)} icon={ShoppingBag} loading={isLoading} />
        <KpiCard title="New Customers" value={formatNumber(data?.new_customers ?? 0)} subtitle={`Avg order: ${formatTHB(data?.avg_order_value ?? 0)}`} icon={Users} loading={isLoading} />
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

      {/* Trend Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily Sales Trend (THB)</CardTitle></CardHeader>
        <CardContent>
          {lineData.length > 0 ? (
            <NivoLine data={lineData} height={300} enableArea />
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No sales data for this period</div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart — last 14 days */}
      {barData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Last 14 Days — Online vs Offline</CardTitle></CardHeader>
          <CardContent>
            <NivoBar data={barData} keys={['online', 'offline']} indexBy="date" height={260} />
          </CardContent>
        </Card>
      )}

      {/* Recent Orders */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            data={(data?.recent_orders ?? []) as unknown as Record<string, unknown>[]}
            columns={orderColumns as never}
            pageSize={15}
          />
        </CardContent>
      </Card>
    </div>
  )
}
