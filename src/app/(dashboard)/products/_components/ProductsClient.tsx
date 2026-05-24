'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { columns as productColumns } from '../columns'
import { formatTHB, formatNumber, formatPct } from '@/lib/utils'
import { Package, Percent, LayoutGrid, Award } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ProductRow {
  prod_num: string
  brands: string | null
  product_name_th: string | null
  product_name_en: string | null
  is_uni_hoc_pd: boolean
  total_qty: number
  total_sales: number
  pct_of_total: number
}

interface BrandRow {
  brands: string
  total_sales: number
  total_qty: number
  product_count: number
  pct_of_total: number
}

interface ProductKpi {
  by_product: ProductRow[]
  by_brand: BrandRow[]
  total_revenue: number
  uni_revenue: number
  uni_revenue_pct: number
  uni_product_count: number
}

const brandColumns: ColumnDef<BrandRow>[] = [
  {
    accessorKey: 'brands',
    header: 'Brand Name',
    cell: ({ row }) => <span className="font-semibold">{row.original.brands}</span>,
  },
  {
    accessorKey: 'product_count',
    header: 'SKU Count',
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
    header: 'Share of Unilever HOC',
    cell: ({ row }) => <div className="text-right">{formatPct(row.original.pct_of_total)}</div>,
  },
]

export default function ProductsClient() {
  const { data, isLoading } = useDashboardSWR<ProductKpi>('/api/data/products')
  const [activeTab, setActiveTab] = useState('products')

  const brandChartData = useMemo(() => {
    if (!data?.by_brand) return []
    return data.by_brand
      .slice(0, 10)
      .map(b => ({
        name: b.brands,
        Sales: b.total_sales,
      }))
  }, [data])

  if (isLoading) return <PageLoading />
  if (!data || data.uni_revenue === 0) {
    return <PageEmpty message="No product sales data available" hint="Please upload products & sales data and build mart." />
  }

  return (
    <div className="space-y-6">
      {/* Product KPIs */}
      <KpiGrid cols={4}>
        <KpiCard
          title="Grand Category Revenue"
          value={formatTHB(data.total_revenue)}
          subtitle="All brands combined sales"
          icon={LayoutGrid}
        />
        <KpiCard
          title="Unilever HOC Revenue"
          value={formatTHB(data.uni_revenue)}
          subtitle="Home Care category sales"
          icon={Award}
        />
        <KpiCard
          title="Unilever Market Share"
          value={formatPct(data.uni_revenue_pct)}
          subtitle="Unilever share of total category"
          valueClassName="text-blue-600"
          icon={Percent}
        />
        <KpiCard
          title="Unilever Active SKUs"
          value={formatNumber(data.uni_product_count)}
          subtitle="Registered HOC SKUs"
          icon={Package}
        />
      </KpiGrid>

      {/* Brand Sales Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Unilever HOC Revenue by Brand</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brandChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground font-medium" />
                <YAxis tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground font-medium" tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: 'hsl(var(--radius))' }}
                  labelClassName="text-xs font-bold"
                  formatter={(value: any) => [formatTHB(Number(value)), '']}
                />
                <Bar dataKey="Sales" fill="#003DA6" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tables for Products and Brands */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">Top SKUs Performance</TabsTrigger>
              <TabsTrigger value="brands">Top Brands Performance</TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="pt-2">
              <DataTable
                columns={productColumns}
                data={data.by_product}
              />
            </TabsContent>
            <TabsContent value="brands" className="pt-2">
              <DataTable
                columns={brandColumns}
                data={data.by_brand}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
