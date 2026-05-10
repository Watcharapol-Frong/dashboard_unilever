'use client'
import { useState } from 'react'
import { useKpi } from '@/hooks/useKpi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { NivoBar } from '@/components/charts/NivoBar'
import { NivoPie } from '@/components/charts/NivoPie'
import { formatTHB, formatNumber, formatPct } from '@/lib/utils'
import type { ProductKpi } from '@/types'

export default function ProductsPage() {
  const { data, isLoading } = useKpi<ProductKpi>('/api/kpi/products')
  const [brandFilter, setBrandFilter] = useState('')

  const allBrands = Array.from(new Set((data?.by_sku ?? []).map(s => s.product_brand).filter(Boolean))) as string[]
  const filtered = brandFilter ? (data?.by_sku ?? []).filter(s => s.product_brand === brandFilter) : (data?.by_sku ?? [])

  const top10 = filtered.slice(0, 10)
  const barData = top10.map(s => ({ sku: s.product_sku, 'Revenue (THB)': s.sales_amount }))
  const brandPie = [...new Map(filtered.map(s => [s.product_brand ?? 'Unknown', s.sales_amount])).entries()]
    .map(([id, value]) => ({ id, label: id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const columns = [
    { key: 'product_sku', header: 'SKU', sortable: true },
    { key: 'product_brand', header: 'Brand', render: (r: typeof filtered[0]) => r.product_brand ?? '-', sortable: true },
    { key: 'qty', header: 'Qty Sold', sortable: true, align: 'right' as const, render: (r: typeof filtered[0]) => formatNumber(r.qty) },
    { key: 'sales_amount', header: 'Revenue (THB)', sortable: true, align: 'right' as const, render: (r: typeof filtered[0]) => formatTHB(r.sales_amount) },
    { key: 'pct_of_total', header: '% of Total', sortable: true, align: 'right' as const, render: (r: typeof filtered[0]) => formatPct(r.pct_of_total) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Performance</h1>
          <p className="text-muted-foreground text-sm mt-1">SKU and brand breakdown for Unilever products</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Filter by brand:</label>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="">All Brands</option>
            {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 SKUs by Revenue</CardTitle></CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <NivoBar data={barData} keys={['Revenue (THB)']} indexBy="sku" height={320} layout="horizontal" legend={false} valueFormat={v => formatTHB(v)} />
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">{isLoading ? 'Loading...' : 'No data'}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Brand</CardTitle></CardHeader>
          <CardContent>
            {brandPie.length > 0 ? (
              <NivoPie data={brandPie} height={320} />
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">{isLoading ? 'Loading...' : 'No data'}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Products</CardTitle>
            <span className="text-sm text-muted-foreground">
              Total Revenue: {formatTHB(filtered.reduce((s, r) => s + r.sales_amount, 0))}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filtered as unknown as Record<string, unknown>[]}
            columns={columns as never}
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  )
}
