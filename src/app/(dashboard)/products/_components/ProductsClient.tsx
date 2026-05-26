'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { useBuild } from '@/context/BuildContext'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_AXIS_CLS, CHART_TOOLTIP_STYLE } from '@/lib/chart-utils'
import { formatTHB, formatNumber, formatPct, fmtBaht } from '@/lib/formatters'
import { columns as baseProductColumns } from '../columns'
import { Package, ShoppingCart, TrendingUp, BarChart2, Calendar, UserPlus, Users } from 'lucide-react'
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

interface ProductOptions {
  brands: string[]
  class_names: string[]
  senior_buyers: string[]
  buyers: string[]
  subclasses: string[]
  months: string[]
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
  months: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_COLORS = ['#003DA6', '#EE2737', '#10b981', '#f59e0b', '#8b5cf6']

function lastDayOfMonth(isoDate: string) {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(y, m, 0).toISOString().split('T')[0]
}

function getSegment(p: { new_customers: number; retention_customers: number }): 'hook_new' | 'pull_old' | 'mixed' | 'no_data' {
  const total = p.new_customers + p.retention_customers
  if (total === 0) return 'no_data'
  const newPct = (p.new_customers / total) * 100
  if (newPct >= 70) return 'hook_new'
  if (newPct <= 30) return 'pull_old'
  return 'mixed'
}

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
      const seg = getSegment(row.original)
      if (seg === 'no_data') return <span className="text-xs text-muted-foreground">—</span>
      if (seg === 'hook_new') return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <UserPlus className="h-3 w-3" /> New Customer Driver
        </span>
      )
      if (seg === 'pull_old') return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600">
          <Users className="h-3 w-3" /> Retention Driver
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

const EMPTY_OPTS: ProductOptions = { brands: [], class_names: [], senior_buyers: [], buyers: [], subclasses: [], months: [] }

export default function ProductsClient() {
  const { buildVersion } = useBuild()

  // Options fetched once and cached for 1hr — independent of filter changes
  const { data: optsData } = useDashboardSWR<ProductOptions>('/api/data/products/options', {
    dedupingInterval: 3_600_000,
  })
  const opts = optsData ?? EMPTY_OPTS

  // Date range
  const [rangeFrom,  setRangeFrom]  = useState<string | null>(null)
  const [rangeTo,    setRangeTo]    = useState<string | null>(null)
  const [hoverMonth, setHoverMonth] = useState<string | null>(null)

  // Dimension filters
  const [filterBrands,      setFilterBrands]      = useState<string[]>([])
  const [filterClass,       setFilterClass]       = useState<string[]>([])
  const [filterSeniorBuyer, setFilterSeniorBuyer] = useState<string[]>([])
  const [filterBuyer,       setFilterBuyer]       = useState<string[]>([])
  const [filterSubclass,    setFilterSubclass]    = useState<string[]>([])
  const [filterSegment,     setFilterSegment]     = useState('all')
  const [prodSearch,        setProdSearch]        = useState('')
  const [activeTab,         setActiveTab]         = useState('products')

  const handleChipClick = (m: string) => {
    if (!rangeFrom || (rangeFrom && rangeTo)) {
      setRangeFrom(m); setRangeTo(null)
    } else if (m === rangeFrom) {
      setRangeFrom(null); setRangeTo(null)
    } else if (m < rangeFrom) {
      setRangeFrom(m); setRangeTo(rangeFrom)
    } else {
      setRangeTo(m)
    }
  }

  // Build API URL from current filter state
  const apiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (filterBrands.length > 0)      p.set('brands',       filterBrands.join(','))
    if (filterClass.length > 0)       p.set('class_name',   filterClass.join(','))
    if (filterSeniorBuyer.length > 0) p.set('senior_buyer', filterSeniorBuyer.join(','))
    if (filterBuyer.length > 0)       p.set('buyer',        filterBuyer.join(','))
    if (filterSubclass.length > 0)    p.set('subclass',     filterSubclass.join(','))
    if (rangeFrom) {
      p.set('startDate', rangeFrom)
      p.set('endDate',   lastDayOfMonth(rangeTo ?? rangeFrom))
    }
    const qs = p.toString()
    return `/api/data/products${qs ? `?${qs}` : ''}`
  }, [filterBrands, filterClass, filterSeniorBuyer, filterBuyer, filterSubclass, rangeFrom, rangeTo])

  // useEffect fetch — re-runs whenever apiUrl changes; keeps previous data on error
  const [data,      setData]      = useState<ProductData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchErr,  setFetchErr]  = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setFetchErr(null)
    fetch(apiUrl)
      .then(r => r.json())
      .then((j: { ok: boolean; data?: ProductData; error?: string }) => {
        if (!cancelled) {
          if (j.ok && j.data) setData(j.data)
          else setFetchErr(j.error ?? 'Unknown error')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setFetchErr(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [apiUrl, buildVersion])

  const hasFilter = filterBrands.length > 0 || filterClass.length > 0 ||
    filterSeniorBuyer.length > 0 || filterBuyer.length > 0 || filterSubclass.length > 0
  const hasRange  = !!rangeFrom

  const clearAll = () => {
    setFilterBrands([]); setFilterClass([])
    setFilterSeniorBuyer([]); setFilterBuyer([]); setFilterSubclass([])
    setRangeFrom(null); setRangeTo(null)
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

  const segmentFiltered = useMemo(() => {
    if (filterSegment === 'all') return filteredProducts
    return filteredProducts.filter(p => getSegment(p) === filterSegment)
  }, [filteredProducts, filterSegment])

  if (isLoading && !data) return <PageLoading />
  if (!data) {
    return <PageEmpty message="No product sales data available" hint="Please build mart first." />
  }

  const top5      = data.top5_brands
  const trendData = data.by_brand_trend
  const months    = opts.months

  const activeRangeLabel = (() => {
    if (!rangeFrom) return 'All available periods'
    const fromLabel = new Date(rangeFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    if (!rangeTo) return `Month: ${fromLabel}`
    const toLabel = new Date(rangeTo).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    return `${fromLabel} – ${toLabel}`
  })()

  return (
    <div className="space-y-6">

      {/* ── Filter & Range Selection ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter & Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Month chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {months.map(m => {
                const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
                const active   = m === rangeFrom || m === rangeTo
                const inRange  = !!(rangeFrom && effectiveTo && m > rangeFrom && m < effectiveTo)
                const preview  = !!(!rangeTo && rangeFrom && hoverMonth && m > rangeFrom && m <= hoverMonth)
                return (
                  <button
                    key={m}
                    onClick={() => handleChipClick(m)}
                    onMouseEnter={() => setHoverMonth(m)}
                    onMouseLeave={() => setHoverMonth(null)}
                    className={[
                      'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none border',
                      active
                        ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                        : inRange || preview
                        ? 'bg-[#003DA6]/10 text-[#003DA6] border-[#003DA6]/20'
                        : 'bg-background text-muted-foreground border-gray-200 hover:bg-gray-50 hover:text-foreground',
                    ].join(' ')}
                  >
                    {new Date(m).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  </button>
                )
              })}
            </div>

            <div className="w-px h-6 bg-border hidden lg:block" />

            {/* Dimension filters */}
            <MultiSelect
              label="All Brands"
              value={filterBrands}
              onChange={setFilterBrands}
              options={opts.brands.map(v => ({ value: v, label: v }))}
              width="w-[140px]"
            />
            <MultiSelect
              label="All Senior Buyers"
              value={filterSeniorBuyer}
              onChange={setFilterSeniorBuyer}
              options={opts.senior_buyers.map(v => ({ value: v, label: v }))}
              width="w-[165px]"
            />
            <MultiSelect
              label="All Buyers"
              value={filterBuyer}
              onChange={setFilterBuyer}
              options={opts.buyers.map(v => ({ value: v, label: v }))}
              width="w-[140px]"
            />
            <MultiSelect
              label="All Classes"
              value={filterClass}
              onChange={setFilterClass}
              options={opts.class_names.map(v => ({ value: v, label: v }))}
              width="w-[140px]"
            />
            <MultiSelect
              label="All Subclasses"
              value={filterSubclass}
              onChange={setFilterSubclass}
              options={opts.subclasses.map(v => ({ value: v, label: v }))}
              width="w-[145px]"
            />

            {(hasFilter || hasRange) && (
              <button onClick={clearAll} className="text-xs text-[#003DA6] hover:underline font-semibold">
                Reset All
              </button>
            )}
          </div>

          {rangeFrom && (
            <p className="text-xs text-muted-foreground mt-3">
              Selected range: <span className="font-semibold text-foreground">{activeRangeLabel}</span>
            </p>
          )}
          {fetchErr && (
            <p className="text-xs text-red-500 mt-2">Failed to load filtered data: {fetchErr}</p>
          )}
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
          <CardTitle className="text-sm font-medium">Brand Sales Trend (Top 5)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monthly telesales revenue per brand — track momentum over time
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
              {top5.filter(b => b !== 'Other').map((brand, i) => (
                <Line
                  key={brand}
                  type="monotone"
                  dataKey={brand}
                  stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
              {top5.includes('Other') && (
                <Line
                  key="Other"
                  type="monotone"
                  dataKey="Other"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
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

            {/* ── Top SKUs ────────────────────────────────────────────── */}
            <TabsContent value="products" className="pt-2">
              <DataTable
                columns={baseProductColumns as ColumnDef<ExtProductRow>[]}
                data={filteredProducts}
                searchValue={prodSearch}
                onSearchChange={setProdSearch}
                searchPlaceholder="Search product ID or name…"
              />
            </TabsContent>

            {/* ── New vs Retention ────────────────────────────────────── */}
            <TabsContent value="new_vs_retention" className="pt-2">
              <div className="flex items-center gap-4 mb-3 px-1 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                  <span><span className="font-semibold text-emerald-600">New Customer Driver</span> — new ≥ 70%</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-teal-600" />
                  <span><span className="font-semibold text-teal-600">Retention Driver</span> — retention ≥ 70%</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-muted-foreground">Mixed</span>
                  <span>— 30–70%</span>
                </div>
              </div>
              <DataTable
                columns={newVsRetentionColumns}
                data={segmentFiltered}
                searchValue={prodSearch}
                onSearchChange={setProdSearch}
                searchPlaceholder="Search product ID or name…"
                toolbarLeft={
                  <Select value={filterSegment} onValueChange={setFilterSegment}>
                    <SelectTrigger className="h-8 text-xs w-[155px]">
                      <SelectValue placeholder="All Segments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Segments</SelectItem>
                      <SelectItem value="hook_new">New Customer Driver</SelectItem>
                      <SelectItem value="pull_old">Retention Driver</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                }
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
