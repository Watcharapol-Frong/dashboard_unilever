'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatTHB, formatNumber, formatPct, fmtBaht } from '@/lib/formatters'
import { columns as productColumns } from '../columns'
import { Package, ShoppingCart, TrendingUp, BarChart2, Search, Filter } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductRow {
  prod_num: string
  brands: string | null
  product_name_th: string | null
  product_name_en: string | null
  class_name: string | null
  subclass: string | null
  senior_buyer_name: string | null
  buyer_name: string | null
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

interface ProductData {
  by_product: ProductRow[]
  by_brand: BrandRow[]
  total_sales: number
  total_qty: number
  total_skus: number
  total_orders: number
  avg_order_value: number
  options: {
    brands: string[]
    class_names: string[]
    senior_buyers: string[]
    buyers: string[]
    subclasses: string[]
  }
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(j => {
    if (!j.ok) throw new Error(j.error ?? 'fetch error')
    return j.data as ProductData
  })

// ── Brand table columns ───────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductsClient() {
  // Server-side filters
  const [filterBrands,      setFilterBrands]      = useState('all')
  const [filterClass,       setFilterClass]       = useState('all')
  const [filterSeniorBuyer, setFilterSeniorBuyer] = useState('all')
  const [filterBuyer,       setFilterBuyer]       = useState('all')
  const [filterSubclass,    setFilterSubclass]    = useState('all')

  // Client-side prod_num search (table only)
  const [prodSearch, setProdSearch] = useState('')

  const [activeTab, setActiveTab] = useState('products')

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (filterBrands      !== 'all') p.set('brands',       filterBrands)
    if (filterClass       !== 'all') p.set('class_name',   filterClass)
    if (filterSeniorBuyer !== 'all') p.set('senior_buyer', filterSeniorBuyer)
    if (filterBuyer       !== 'all') p.set('buyer',        filterBuyer)
    if (filterSubclass    !== 'all') p.set('subclass',     filterSubclass)
    const qs = p.toString()
    return `/api/data/products${qs ? `?${qs}` : ''}`
  }, [filterBrands, filterClass, filterSeniorBuyer, filterBuyer, filterSubclass])

  const { data, isLoading } = useSWR<ProductData>(apiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
  })

  const hasFilter = filterBrands !== 'all' || filterClass !== 'all' ||
    filterSeniorBuyer !== 'all' || filterBuyer !== 'all' || filterSubclass !== 'all'

  const clearFilters = () => {
    setFilterBrands('all'); setFilterClass('all')
    setFilterSeniorBuyer('all'); setFilterBuyer('all'); setFilterSubclass('all')
  }

  // Client-side prod_num search on the already-loaded by_product list
  const filteredProducts = useMemo(() => {
    if (!data?.by_product) return []
    const q = prodSearch.trim().toLowerCase()
    if (!q) return data.by_product
    return data.by_product.filter(p =>
      p.prod_num.toLowerCase().includes(q) ||
      (p.product_name_th ?? '').toLowerCase().includes(q) ||
      (p.product_name_en ?? '').toLowerCase().includes(q)
    )
  }, [data?.by_product, prodSearch])

  const brandChartData = useMemo(() => {
    if (!data?.by_brand) return []
    return data.by_brand.slice(0, 10).map(b => ({ name: b.brands, Sales: b.total_sales }))
  }, [data])

  if (isLoading && !data) return <PageLoading />
  if (!data || data.total_sales === 0) {
    return <PageEmpty message="No product sales data available" hint="Please build mart first." />
  }

  const opts = data.options

  return (
    <div className="space-y-6">

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter by Product</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">

            <Select value={filterBrands} onValueChange={setFilterBrands}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {opts.brands.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {opts.class_names.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterSubclass} onValueChange={setFilterSubclass}>
              <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="All Subclasses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subclasses</SelectItem>
                {opts.subclasses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterSeniorBuyer} onValueChange={setFilterSeniorBuyer}>
              <SelectTrigger className="h-7 text-xs w-[180px]"><SelectValue placeholder="All Senior Buyers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Senior Buyers</SelectItem>
                {opts.senior_buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterBuyer} onValueChange={setFilterBuyer}>
              <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="All Buyers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Buyers</SelectItem>
                {opts.buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasFilter && (
              <button
                onClick={clearFilters}
                className="text-xs text-[#003DA6] hover:underline font-semibold"
              >
                Reset All
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
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

      {/* ── Brand Chart ───────────────────────────────────────────────────── */}
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

      {/* ── Tables ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="products">Top SKUs</TabsTrigger>
                <TabsTrigger value="brands">By Brand</TabsTrigger>
              </TabsList>

              {/* Product ID / name search — client-side, only affects SKU tab */}
              {activeTab === 'products' && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={prodSearch}
                    onChange={e => setProdSearch(e.target.value)}
                    placeholder="Search product ID or name…"
                    className={cn('h-7 pl-8 text-xs', prodSearch && 'border-[#003DA6]')}
                  />
                </div>
              )}
            </div>

            <TabsContent value="products" className="pt-2">
              {prodSearch && (
                <p className="text-xs text-muted-foreground mb-2">
                  {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} for
                  {' '}<span className="font-medium text-foreground">"{prodSearch}"</span>
                </p>
              )}
              <DataTable columns={productColumns} data={filteredProducts} />
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
