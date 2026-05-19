'use client'
import { useState } from 'react'
import { useKpi } from '@/hooks/useKpi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/dashboard/DataTable'
import { NivoBar } from '@/components/charts/NivoBar'
import { NivoPie } from '@/components/charts/NivoPie'
import { Badge } from '@/components/ui/badge'
import { formatTHB, formatNumber, formatPct } from '@/lib/utils'
import type { ProductKpi, ProductRow } from '@/types'

export default function ProductsPage() {
  const { data, isLoading } = useKpi<ProductKpi>('/api/analytics/products')
  const [brandFilter, setBrandFilter] = useState('')
  const [showUniOnly, setShowUniOnly] = useState(false)

  const allBrands = Array.from(
    new Set((data?.by_product ?? []).map(p => p.brands).filter(Boolean))
  ) as string[]

  const filtered = (data?.by_product ?? []).filter(p => {
    if (brandFilter && p.brands !== brandFilter) return false
    if (showUniOnly && !p.is_uni_hoc_pd) return false
    return true
  })

  const top10 = filtered.slice(0, 10)
  const barData = top10.map(p => ({
    prod: p.prod_num,
    'Revenue (THB)': p.total_sales,
  }))

  // Brand pie from by_brand (already aggregated)
  const brandPie = (data?.by_brand ?? [])
    .filter(b => !brandFilter || b.brands === brandFilter)
    .slice(0, 8)
    .map(b => ({ id: b.brands, label: b.brands, value: b.total_sales }))

  const columns = [
    {
      key: 'prod_num', header: 'Product #', sortable: true,
    },
    {
      key: 'brands', header: 'Brand',
      render: (r: ProductRow) => r.brands ?? '-',
      sortable: true,
    },
    {
      key: 'product_name_th', header: 'Product Name (TH)',
      render: (r: ProductRow) => r.product_name_th ?? '-',
    },
    {
      key: 'is_uni_hoc_pd', header: 'Unilever HOC',
      align: 'center' as const,
      render: (r: ProductRow) => r.is_uni_hoc_pd
        ? <Badge variant="default" className="text-xs">Unilever</Badge>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: 'total_qty', header: 'Qty Sold', sortable: true, align: 'right' as const,
      render: (r: ProductRow) => formatNumber(r.total_qty),
    },
    {
      key: 'total_sales', header: 'Revenue (THB)', sortable: true, align: 'right' as const,
      render: (r: ProductRow) => formatTHB(r.total_sales),
    },
    {
      key: 'pct_of_total', header: '% of Total', sortable: true, align: 'right' as const,
      render: (r: ProductRow) => formatPct(r.pct_of_total),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product Performance</h1>
          <p className="text-muted-foreground text-sm mt-1">SKU and brand breakdown for the selected period</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showUniOnly}
              onChange={e => setShowUniOnly(e.target.checked)}
              className="rounded"
            />
            Unilever HOC only
          </label>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold mt-1">{formatTHB(data?.total_revenue ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Unilever HOC Revenue</p>
            <p className="text-2xl font-bold mt-1">{formatTHB(data?.uni_revenue ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatPct(data?.uni_revenue_pct ?? 0)} of total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Unilever HOC Products</p>
            <p className="text-2xl font-bold mt-1">{formatNumber(data?.uni_product_count ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Filtered Products</p>
            <p className="text-2xl font-bold mt-1">{formatNumber(filtered.length)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <NivoBar
                data={barData}
                keys={['Revenue (THB)']}
                indexBy="prod"
                height={320}
                layout="horizontal"
                legend={false}
                valueFormat={v => formatTHB(Number(v))}
                colors={['#003DA6']}
              />
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                {isLoading ? 'Loading...' : 'No data'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Brand</CardTitle></CardHeader>
          <CardContent>
            {brandPie.length > 0 ? (
              <NivoPie data={brandPie} height={320} />
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                {isLoading ? 'Loading...' : 'No data'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Products</CardTitle>
            <span className="text-sm text-muted-foreground">
              Total Revenue: {formatTHB(filtered.reduce((s, r) => s + r.total_sales, 0))}
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
