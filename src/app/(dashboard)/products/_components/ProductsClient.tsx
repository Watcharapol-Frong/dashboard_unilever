'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatTHB, formatNumber, formatPct, fmtBaht } from '@/lib/formatters'
import { columns as productColumns } from '../columns'
import { Package, ShoppingCart, TrendingUp, BarChart2 } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'

interface BrandRow {
  brands: string
  total_sales: number
  total_qty: number
  product_count: number
  pct_of_total: number
}

interface ProductKpi {
  by_product: {
    prod_num: string
    brands: string | null
    product_name_th: string | null
    product_name_en: string | null
    is_uni_hoc_pd: boolean
    total_qty: number
    total_sales: number
    pct_of_total: number
  }[]
  by_brand: BrandRow[]
  total_sales: number
  total_qty: number
  total_skus: number
  total_orders: number
  avg_order_value: number
}

const brandColumns: ColumnDef<BrandRow>[] = [
  {
    accessorKey: 'brands',
    header: 'Brand',
    cell: ({ row }) => <span className="font-semibold">{row.original.brands}</span>,
  },
  {
    accessorKey: 'product_count',
    header: 'SKUs',
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.product_count)}</div>,
  },
  {
    accessorKey: 'total_qty',
    header: 'Qty Sold',
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.total_qty)}</div>,
  },
  {
    accessorKey: 'total_sales',
    header: 'Revenue (THB)',
    cell: ({ row }) => <div className="text-right font-medium">{formatTHB(row.original.total_sales)}</div>,
  },
  {
    accessorKey: 'pct_of_total',
    header: '% of Total',
    cell: ({ row }) => <div className="text-right">{formatPct(row.original.pct_of_total)}</div>,
  },
]

export default function ProductsClient() {
  const { data, isLoading } = useDashboardSWR<ProductKpi>('/api/data/products')
  const [activeTab, setActiveTab] = useState('products')

  const brandChartData = useMemo(() => {
    if (!data?.by_brand) return []
    return data.by_brand.slice(0, 10).map(b => ({ name: b.brands, Sales: b.total_sales }))
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.total_sales === 0) {
    return <PageEmpty message="No product sales data available" hint="Please build mart first." />
  }

  return (
    <div className="space-y-6">
      <KpiGrid cols={4}>
        <KpiCard
          title="Total Telesales Revenue"
          value={fmtBaht(data.total_sales)}
          subtitle={`${formatNumber(data.total_orders)} orders total`}
          icon={TrendingUp}
        />
        <KpiCard
          title="Avg Order Value"
          value={fmtBaht(data.avg_order_value)}
          subtitle="Per telesales order"
          icon={ShoppingCart}
        />
        <KpiCard
          title="Total Qty Sold"
          value={formatNumber(data.total_qty)}
          subtitle="Units across all SKUs"
          icon={BarChart2}
        />
        <KpiCard
          title="Active SKUs"
          value={formatNumber(data.total_skus)}
          subtitle="Distinct products with sales"
          icon={Package}
        />
      </KpiGrid>

      <ChartCard title="Revenue by Brand (Top 10)" height={280}>
        <BarChart data={brandChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS}
            tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelClassName="text-xs font-bold"
            formatter={(value: any) => [formatTHB(Number(value)), 'Revenue']} />
          <Bar dataKey="Sales" fill="#003DA6" radius={[4, 4, 0, 0]} barSize={32} />
        </BarChart>
      </ChartCard>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">Top SKUs</TabsTrigger>
              <TabsTrigger value="brands">By Brand</TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="pt-2">
              <DataTable columns={productColumns} data={data.by_product} />
            </TabsContent>
            <TabsContent value="brands" className="pt-2">
              <DataTable columns={brandColumns} data={data.by_brand} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
