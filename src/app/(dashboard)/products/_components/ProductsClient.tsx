'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatTHB, formatNumber, formatPct, fmtBaht } from '@/lib/formatters'
import { columns as baseProductColumns } from '../columns'
import { Package, ShoppingCart, TrendingUp, BarChart2, Filter, UserPlus, Users } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtProductRow {
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
  new_customers: number
  retention_customers: number
  pct_of_total: number
}

interface BrandRow {
  brands: string
  total_sales: number
  online_sales: number
  offline_sales: number
  online_pct: number
  offline_pct: number
  total_qty: number
  product_count: number
  pct_of_total: number
}

interface ProductData {
  by_product: ExtProductRow[]
  by_brand: BrandRow[]
  by_brand_trend: Record<string, string | number>[]
  top5_brands: string[]
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

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_COLORS = ['#003DA6', '#EE2737', '#10b981', '#f59e0b', '#8b5cf6']

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(j => {
    if (!j.ok) throw new Error(j.error ?? 'fetch error')
    return j.data as ProductData
  })

// ── New vs Retention columns ──────────────────────────────────────────────────

const newVsRetentionColumns: ColumnDef<ExtProductRow>[] = [
  {
    accessorKey: 'prod_num',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Product #" />,
  },
  {
    accessorKey: 'brands',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
    cell: ({ row }) => row.original.brands ?? '-',
  },
  {
    accessorKey: 'product_name_th',
    header: 'Product Name (TH)',
    cell: ({ row }) => (
      <div className="max-w-[320px] truncate" title={row.original.product_name_th ?? ''}>
        {row.original.product_name_th ?? '-'}
      </div>
    ),
  },
  {
    accessorKey: 'new_customers',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="New Customers" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-semibold text-emerald-600">
        {formatNumber(row.original.new_customers)}
      </div>
    ),
  },
  {
    accessorKey: 'retention_customers',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Retention" className="justify-end" />
    ),
    cell: ({ row }) => (
      <div className="text-right font-semibold text-teal-600">
        {formatNumber(row.original.retention_customers)}
      </div>
    ),
  },
  {
    id: 'new_pct',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="New %" className="justify-end" />
    ),
    cell: ({ row }) => {
      const total = row.original.new_customers + row.original.retention_customers
      if (total === 0) return <div className="text-right text-muted-foreground">—</div>
      const pct = (row.original.new_customers / total) * 100
      return (
        <div className="text-right">
          <span className={pct >= 50 ? 'text-emerald-600 font-semibold' : 'text-teal-600 font-semibold'}>
            {pct.toFixed(0)}%
          </span>
        </div>
      )
    },
  },
  {
    id: 'segment',
    header: 'Segment',
    cell: ({ row }) => {
      const { new_customers, retention_customers } = row.original
      const total = new_customers + retention_customers
      if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
      const newPct = (new_customers / total) * 100
      if (newPct >= 70) return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <UserPlus className="h-3 w-3" /> Hook คนใหม่
        </span>
      )
      if (newPct <= 30) return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600">
          <Users className="h-3 w-3" /> ดึงคนเก่า
        </span>
      )
      return <span className="text-xs text-muted-foreground font-medium">Mixed</span>
    },
  },
]

// ── Brand summary columns ─────────────────────────────────────────────────────

const brandColumns: ColumnDef<BrandRow>[] = [
  {
    accessorKey: 'brands',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
    cell: ({ row }) => <span className="font-semibold">{row.original.brands}</span>,
  },
  {
    accessorKey: 'product_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="SKUs" className="justify-end" />,
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.product_count)}</div>,
  },
  {
    accessorKey: 'total_qty',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qty Sold" className="justify-end" />,
    cell: ({ row }) => <div className="text-right">{formatNumber(row.original.total_qty)}</div>,
  },
  {
    accessorKey: 'total_sales',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Revenue" className="justify-end" />,
    cell: ({ row }) => <div className="text-right font-semibold">{formatTHB(row.original.total_sales)}</div>,
  },
  {
    accessorKey: 'online_sales',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Online" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right">
        <div className="font-medium text-[#003DA6]">{formatTHB(row.original.online_sales)}</div>
        <div className="text-[10px] text-muted-foreground">{formatPct(row.original.online_pct)}</div>
      </div>
    ),
  },
  {
    accessorKey: 'offline_sales',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Offline" className="justify-end" />,
    cell: ({ row }) => (
      <div className="text-right">
        <div className="font-medium text-[#EE2737]">{formatTHB(row.original.offline_sales)}</div>
        <div className="text-[10px] text-muted-foreground">{formatPct(row.original.offline_pct)}</div>
      </div>
    ),
  },
  {
    id: 'channel_bar',
    header: 'Channel Mix',
    cell: ({ row }) => {
      const onPct  = row.original.online_pct  * 100
      const offPct = row.original.offline_pct * 100
      return (
        <div className="w-24">
          <div className="h-2 rounded-full overflow-hidden flex">
            <div className="h-full bg-[#003DA6]" style={{ width: `${onPct}%` }} />
            <div className="h-full bg-[#EE2737]" style={{ width: `${offPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{onPct.toFixed(0)}%</span>
            <span>{offPct.toFixed(0)}%</span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'pct_of_total',
    header: ({ column }) => <DataTableColumnHeader column={column} title="% of Total" className="justify-end" />,
    cell: ({ row }) => <div className="text-right">{formatPct(row.original.pct_of_total)}</div>,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductsClient() {
  const [filterBrands,      setFilterBrands]      = useState('all')
  const [filterClass,       setFilterClass]       = useState('all')
  const [filterSeniorBuyer, setFilterSeniorBuyer] = useState('all')
  const [filterBuyer,       setFilterBuyer]       = useState('all')
  const [filterSubclass,    setFilterSubclass]    = useState('all')
  const [prodSearch,        setProdSearch]        = useState('')
  const [activeTab,         setActiveTab]         = useState('products')

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

  if (isLoading && !data) return <PageLoading />
  if (!data || data.total_sales === 0) {
    return <PageEmpty message="No product sales data available" hint="Please build mart first." />
  }

  const opts       = data.options
  const top5       = data.top5_brands
  const trendData  = data.by_brand_trend

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
            <Select value={filterSeniorBuyer} onValueChange={setFilterSeniorBuyer}>
              <SelectTrigger className="h-7 text-xs w-[175px]"><SelectValue placeholder="All Senior Buyers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Senior Buyers</SelectItem>
                {opts.senior_buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBuyer} onValueChange={setFilterBuyer}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Buyers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Buyers</SelectItem>
                {opts.buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="All Classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {opts.class_names.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSubclass} onValueChange={setFilterSubclass}>
              <SelectTrigger className="h-7 text-xs w-[155px]"><SelectValue placeholder="All Subclasses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subclasses</SelectItem>
                {opts.subclasses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilter && (
              <button onClick={clearFilters} className="text-xs text-[#003DA6] hover:underline font-semibold">
                Reset All
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <KpiGrid cols={4}>
        <KpiCard title="Total Telesales Revenue" value={fmtBaht(data.total_sales)}
          subtitle={`${formatNumber(data.total_orders)} orders total`} icon={TrendingUp} />
        <KpiCard title="Avg Order Value" value={fmtBaht(data.avg_order_value)}
          subtitle="Per telesales order" icon={ShoppingCart} />
        <KpiCard title="Total Qty Sold" value={formatNumber(data.total_qty)}
          subtitle="Units across all SKUs" icon={BarChart2} />
        <KpiCard title="Active SKUs" value={formatNumber(data.total_skus)}
          subtitle="Distinct products with sales" icon={Package} />
      </KpiGrid>

      {/* ── Brand Revenue Trend ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Revenue Trend by Brand (Top 5)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monthly telesales revenue per brand — track momentum over time
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                {top5.map((brand, i) => (
                  <linearGradient key={brand} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="month_label" tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} className={CHART_AXIS_CLS}
                tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} width={60} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelClassName="text-xs font-bold"
                formatter={(value: any, name: string) => [formatTHB(Number(value)), name]}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              {top5.map((brand, i) => (
                <Area
                  key={brand}
                  type="monotone"
                  dataKey={brand}
                  stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#grad_${i})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Tables ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="products">Top SKUs</TabsTrigger>
              <TabsTrigger value="new_vs_retention">New vs Retention</TabsTrigger>
              <TabsTrigger value="brands">By Brand</TabsTrigger>
            </TabsList>

            {/* ── Top SKUs (original) ─────────────────────────────────── */}
            <TabsContent value="products" className="pt-2">
              <DataTable
                columns={baseProductColumns as ColumnDef<ExtProductRow>[]}
                data={filteredProducts}
                searchValue={prodSearch}
                onSearchChange={setProdSearch}
                searchPlaceholder="Search product ID or name…"
                toolbarLeft={
                  <>
                    <Select value={filterBrands} onValueChange={setFilterBrands}>
                      <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Brand" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Brands</SelectItem>
                        {opts.brands.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterSeniorBuyer} onValueChange={setFilterSeniorBuyer}>
                      <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Senior Buyer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Senior Buyers</SelectItem>
                        {opts.senior_buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterBuyer} onValueChange={setFilterBuyer}>
                      <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Buyer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Buyers</SelectItem>
                        {opts.buyers.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterClass} onValueChange={setFilterClass}>
                      <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Class" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Classes</SelectItem>
                        {opts.class_names.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterSubclass} onValueChange={setFilterSubclass}>
                      <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Subclass" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subclasses</SelectItem>
                        {opts.subclasses.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </>
                }
              />
            </TabsContent>

            {/* ── New vs Retention ────────────────────────────────────── */}
            <TabsContent value="new_vs_retention" className="pt-2">
              <div className="flex items-center gap-6 mb-3 px-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                  <span><span className="font-semibold text-emerald-600">Hook คนใหม่</span> — new ≥ 70% ของผู้ซื้อ</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-teal-600" />
                  <span><span className="font-semibold text-teal-600">ดึงคนเก่า</span> — retention ≥ 70% ของผู้ซื้อ</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-muted-foreground">Mixed</span>
                  <span>— ระหว่าง 30–70%</span>
                </div>
              </div>
              <DataTable
                columns={newVsRetentionColumns}
                data={filteredProducts}
                searchValue={prodSearch}
                onSearchChange={setProdSearch}
                searchPlaceholder="Search product ID or name…"
              />
            </TabsContent>

            {/* ── By Brand ────────────────────────────────────────────── */}
            <TabsContent value="brands" className="pt-2">
              <DataTable columns={brandColumns} data={data.by_brand} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
