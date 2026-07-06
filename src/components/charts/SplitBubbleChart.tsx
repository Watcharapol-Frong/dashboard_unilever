'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { hierarchy, pack } from 'd3-hierarchy'
import { ChevronLeft, Search, X, LayoutGrid, Table2, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { fmtBaht, fmt } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// ── Public type (shared with API response) ────────────────────────────────────
export type BubbleRecord = {
  senior_buyer_name: string
  buyer_name: string
  brand: string
  prod_num: string
  product_name: string
  converted_sales: number
  qty: number
  converted_online: number
  converted_offline: number
}

// ── Internal hierarchy node type ──────────────────────────────────────────────
type HDatum = {
  id: string
  label: string
  productName?: string
  type: 'root' | 'buyer' | 'brand' | 'product'
  value?: number
  qty?: number
  brand?: string
  buyerName?: string
  prodNums?: string[]
  children?: HDatum[]
}

// ── Color palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#003DA6', '#EE2737', '#F5A623', '#10b981',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#6b7280',
]
const OTHER_COLOR = '#cbd5e1'

function makeBrandColors(records: BubbleRecord[]): Map<string, string> {
  const brands = [...new Set(
    records.filter(r => r.brand !== '__other__').map(r => r.brand)
  )].sort()
  const map = new Map<string, string>()
  brands.forEach((b, i) => map.set(b, PALETTE[i % PALETTE.length]))
  return map
}

// ── Hierarchy builders ────────────────────────────────────────────────────────
function topN<T extends { sales: number }>(items: T[], n: number) {
  const sorted = [...items].sort((a, b) => b.sales - a.sales)
  return { top: sorted.slice(0, n), rest: sorted.slice(n) }
}

function buildBrandHierarchy(records: BubbleRecord[], senior: string): HDatum {
  const sRecs = records.filter(r => r.senior_buyer_name === senior)

  const buyerMap = new Map<string, Map<string, { sales: number; qty: number; prodNums: Set<string> }>>()
  for (const r of sRecs) {
    if (!buyerMap.has(r.buyer_name)) buyerMap.set(r.buyer_name, new Map())
    const bm = buyerMap.get(r.buyer_name)!
    const cur = bm.get(r.brand) ?? { sales: 0, qty: 0, prodNums: new Set<string>() }
    cur.sales += r.converted_sales
    cur.qty   += r.qty
    cur.prodNums.add(r.prod_num)
    bm.set(r.brand, cur)
  }

  const buyerChildren: HDatum[] = []
  for (const [buyerName, bm] of buyerMap) {
    const items = [...bm.entries()].map(([brand, v]) => ({ brand, ...v }))
    const { top, rest } = topN(items, 4)

    const brandNodes: HDatum[] = top.map(({ brand, sales, qty, prodNums }) => ({
      id: `${senior}|${buyerName}|${brand}`,
      label: brand,
      type: 'brand' as const,
      value: sales,
      qty,
      brand,
      buyerName,
      prodNums: [...prodNums],
    }))

    if (rest.length > 0) {
      const otherProdNums = new Set<string>()
      rest.forEach(x => x.prodNums.forEach(p => otherProdNums.add(p)))
      brandNodes.push({
        id: `${senior}|${buyerName}|__other__`,
        label: 'Other Brands',
        type: 'brand',
        value: rest.reduce((s, x) => s + x.sales, 0),
        qty: rest.reduce((s, x) => s + x.qty, 0),
        brand: '__other__',
        buyerName,
        prodNums: [...otherProdNums],
      })
    }

    buyerChildren.push({
      id: `${senior}|${buyerName}`,
      label: buyerName,
      type: 'buyer',
      buyerName,
      children: brandNodes,
    })
  }

  return { id: 'root', label: senior, type: 'root', children: buyerChildren }
}

function buildProductHierarchy(
  records: BubbleRecord[],
  senior: string,
  buyer: string,
  brand: string,
  brandLabel: string,
): HDatum {
  const isOther = brand === '__other__'

  const buyerRecs = records.filter(r => r.senior_buyer_name === senior && r.buyer_name === buyer)
  const brandSales = new Map<string, number>()
  for (const r of buyerRecs) brandSales.set(r.brand, (brandSales.get(r.brand) ?? 0) + r.converted_sales)
  const top4Brands = new Set(
    [...brandSales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b]) => b)
  )

  const filtered = records.filter(r =>
    r.senior_buyer_name === senior &&
    r.buyer_name === buyer &&
    (isOther ? !top4Brands.has(r.brand) : r.brand === brand)
  )

  const prodMap = new Map<string, { prodNum: string; name: string; sales: number; qty: number }>()
  for (const r of filtered) {
    const ex = prodMap.get(r.prod_num) ?? { prodNum: r.prod_num, name: r.product_name, sales: 0, qty: 0 }
    prodMap.set(r.prod_num, { prodNum: ex.prodNum, name: ex.name, sales: ex.sales + r.converted_sales, qty: ex.qty + r.qty })
  }

  const prodItems = [...prodMap.values()].map(p => ({ ...p, brand }))
  const { top, rest } = topN(prodItems, 4)

  const children: HDatum[] = [
    ...top.map(p => ({
      id: `prod|${p.prodNum}`,
      label: p.prodNum,
      productName: p.name,
      type: 'product' as const,
      value: p.sales,
      qty: p.qty,
      brand,
    })),
    ...(rest.length > 0 ? [{
      id: 'prod|__other__',
      label: 'Other',
      type: 'product' as const,
      value: rest.reduce((s, p) => s + p.sales, 0),
      qty: rest.reduce((s, p) => s + p.qty, 0),
      brand,
    }] : []),
  ]

  return { id: 'root', label: brandLabel, type: 'root', children }
}

function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// ── BubblePanel ───────────────────────────────────────────────────────────────
type DrillState = { buyer: string; brand: string; label: string } | null
type TooltipState = { x: number; y: number; datum: HDatum } | null

interface PanelProps {
  senior: string
  records: BubbleRecord[]
  colorMap: Map<string, string>
  search: string
  width: number
  height: number
}

function BubblePanel({ senior, records, colorMap, search, width, height }: PanelProps) {
  const [drill,   setDrill]   = useState<DrillState>(null)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const hierData = useMemo(() => {
    if (drill) return buildProductHierarchy(records, senior, drill.buyer, drill.brand, drill.label)
    return buildBrandHierarchy(records, senior)
  }, [records, senior, drill])

  const packed = useMemo(() => {
    if (width <= 0 || height <= 0) return []
    try {
      const root = hierarchy<HDatum>(hierData)
        .sum(d => d.value ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

      return pack<HDatum>()
        .size([width, height])
        .padding(node => node.depth === 0 ? 12 : 3)
        (root)
        .descendants()
    } catch {
      return []
    }
  }, [hierData, width, height])

  const searchQ  = search.toLowerCase().trim()
  const hasSearch = searchQ.length > 0

  const getColor = useCallback((d: HDatum): string => {
    if (d.type === 'buyer' || d.type === 'root') return 'transparent'
    const key  = d.brand ?? d.label
    const base = colorMap.get(key) ?? OTHER_COLOR
    if (!hasSearch) return base
    const match = d.label.toLowerCase().includes(searchQ)
      || key.toLowerCase().includes(searchQ)
      || (d.productName ?? '').toLowerCase().includes(searchQ)
      || (d.prodNums ?? []).some(p => p.toLowerCase().includes(searchQ))
    return match ? base : base + '28'
  }, [colorMap, hasSearch, searchQ])

  const handleEnter = useCallback((datum: HDatum, cx: number, cy: number, r: number) => {
    setTooltip({ x: cx, y: cy - r - 8, datum })
  }, [])

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>

      {/* Breadcrumb when drilled */}
      {drill && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 py-1.5 z-10 bg-white/80 backdrop-blur border-b border-slate-100">
          <button
            onClick={() => { setDrill(null); setTooltip(null) }}
            className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Back
          </button>
          <span className="text-[11px] font-semibold text-slate-700 mr-1">
            {drill.label} · Products
          </span>
        </div>
      )}

      <svg width={width} height={height} className="block">
        {packed.map(node => {
          const { x, y, r, data, depth } = node
          if (depth === 0) return null

          /* Buyer boundary circles */
          if (data.type === 'buyer') {
            const fs = Math.max(9, Math.min(12, r * 0.16))
            const maxChars = Math.max(6, Math.floor((r * 2) / (fs * 0.55)))
            return (
              <g key={data.id}>
                <circle
                  cx={x} cy={y} r={r}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                />
                <text
                  x={x} y={y - r + fs + 3}
                  textAnchor="middle"
                  fontSize={fs}
                  fill="#94a3b8"
                  fontWeight={600}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {trunc(data.label, maxChars)}
                </text>
              </g>
            )
          }

          /* Brand / product bubbles */
          if (data.type === 'brand' || data.type === 'product') {
            const color    = getColor(data)
            const matched  = hasSearch && (
              data.label.toLowerCase().includes(searchQ) ||
              (data.brand ?? '').toLowerCase().includes(searchQ) ||
              (data.productName ?? '').toLowerCase().includes(searchQ) ||
              (data.prodNums ?? []).some(p => p.toLowerCase().includes(searchQ))
            )
            const canDrill  = data.type === 'brand' && !drill
            const showLabel = r > 18
            const fs       = Math.max(8, Math.min(10, r * 0.3))
            const maxChars = Math.max(3, Math.floor((r * 1.8) / (fs * 0.55)))

            return (
              <g
                key={data.id}
                style={{ cursor: canDrill ? 'pointer' : 'default' }}
                onMouseEnter={() => handleEnter(data, x, y, r)}
                onMouseLeave={() => setTooltip(null)}
                onDoubleClick={() => {
                  if (canDrill && data.buyerName) {
                    setDrill({ buyer: data.buyerName, brand: data.brand!, label: data.label })
                    setTooltip(null)
                  }
                }}
              >
                <circle
                  cx={x} cy={y} r={r}
                  fill={color}
                  stroke={matched ? '#ffffff' : 'rgba(0,0,0,0.06)'}
                  strokeWidth={matched ? 3 : 1}
                />
                {showLabel && (
                  <text
                    x={x} y={y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fs}
                    fill="white"
                    fontWeight={600}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {trunc(data.label, maxChars)}
                  </text>
                )}
                {canDrill && r > 36 && (
                  <text
                    x={x} y={y + fs + 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={8}
                    fill="rgba(255,255,255,0.5)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    double-click ↓
                  </text>
                )}
              </g>
            )
          }

          return null
        })}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 w-48 rounded-lg bg-gray-900/90 px-3 py-2 text-white shadow-xl backdrop-blur text-xs"
          style={{
            left: Math.max(8, Math.min(tooltip.x - 96, width - 200)),
            top: Math.max(drill ? 34 : 4, tooltip.y - 68),
          }}
        >
          <p className="font-semibold text-[13px] leading-snug break-words">{tooltip.datum.label}</p>
          {tooltip.datum.productName && (
            <p className="text-[11px] opacity-60 mb-1 break-words">{tooltip.datum.productName}</p>
          )}
          {!tooltip.datum.productName && <div className="mb-1" />}
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Sales</span>
            <span className="font-medium tabular-nums">{fmtBaht(tooltip.datum.value ?? 0)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="opacity-70">Qty</span>
            <span className="font-medium tabular-nums">{fmt(tooltip.datum.qty ?? 0)} pcs</span>
          </div>
          {tooltip.datum.type === 'brand' && !drill && (
            <p className="mt-1.5 rounded bg-white/10 px-1.5 py-0.5 text-center text-[10px] opacity-70">
              Double-click to drill into products
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Table view aggregation ────────────────────────────────────────────────────
type TableTab = 'brand' | 'category' | 'item'

const TABLE_PAGE_SIZE = 10

type AggRow = {
  key:     string
  labels:  string[]   // Brand → [brand] · Category → [senior, buyer]
  qty:     number
  revenue: number      // converted total revenue (= online + offline)
  online:  number
  offline: number
}

type SortCol = 'label0' | 'label1' | 'qty' | 'revenue' | 'online' | 'offline'
type SortState = { col: SortCol; dir: 'asc' | 'desc' }

function sortValue(r: AggRow, col: SortCol): string | number {
  switch (col) {
    case 'label0': return r.labels[0] ?? ''
    case 'label1': return r.labels[1] ?? ''
    case 'qty':     return r.qty
    case 'revenue': return r.revenue
    case 'online':  return r.online
    case 'offline': return r.offline
  }
}

function aggregate(records: BubbleRecord[], tab: TableTab): AggRow[] {
  const m = new Map<string, AggRow>()
  for (const r of records) {
    let key: string, labels: string[]
    if (tab === 'brand')      { key = r.brand;    labels = [r.brand] }
    else if (tab === 'item')  { key = r.prod_num; labels = [r.prod_num] }
    else                      { key = `${r.senior_buyer_name}|||${r.buyer_name}`; labels = [r.senior_buyer_name, r.buyer_name] }
    const cur = m.get(key) ?? { key, labels, qty: 0, revenue: 0, online: 0, offline: 0 }
    cur.qty     += r.qty
    cur.revenue += r.converted_sales
    cur.online  += r.converted_online
    cur.offline += r.converted_offline
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}

// ── Main chart component ───────────────────────────────────────────────────────
export function SplitBubbleChart({ data, height = 440 }: { data: BubbleRecord[]; height?: number }) {
  const [view,     setView]     = useState<'bubble' | 'table'>('bubble')
  const [tableTab, setTableTab] = useState<TableTab>('brand')
  const [sort,     setSort]     = useState<SortState>({ col: 'revenue', dir: 'desc' })
  const [search,   setSearch]   = useState('')

  const changeTableTab = (id: TableTab) => {
    setTableTab(id)
    setSort({ col: 'revenue', dir: 'desc' })  // reset — label columns differ per dataset
  }

  const toggleSort = (col: SortCol) => setSort(prev =>
    prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'label0' || col === 'label1' ? 'asc' : 'desc' },  // text asc, numbers desc
  )
  const roRef = useRef<ResizeObserver | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Callback ref: re-attach the observer + re-measure on every (re)mount.
  // The bubble container is unmounted in Table view, so a mount-once effect
  // would leave containerWidth stuck at 0 when toggling back → bubbles vanish.
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setContainerWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    roRef.current = ro
  }, [])

  const colorMap = useMemo(() => makeBrandColors(data), [data])

  // Top 2 senior buyers by total converted sales (left/right split)
  const seniors = useMemo(() => {
    const sm = new Map<string, number>()
    for (const r of data) sm.set(r.senior_buyer_name, (sm.get(r.senior_buyer_name) ?? 0) + r.converted_sales)
    return [...sm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s)
  }, [data])

  // Summary totals per senior buyer
  const seniorTotals = useMemo(() => {
    const m = new Map<string, { sales: number; qty: number }>()
    for (const r of data) {
      const cur = m.get(r.senior_buyer_name) ?? { sales: 0, qty: 0 }
      m.set(r.senior_buyer_name, { sales: cur.sales + r.converted_sales, qty: cur.qty + r.qty })
    }
    return m
  }, [data])

  const n = seniors.length
  const GAP = 12
  const panelW = containerWidth > 0 ? Math.floor((containerWidth - GAP * (n - 1)) / n) : 0

  // Legend: top 8 brands across all data
  const legendBrands = useMemo(() => {
    const sm = new Map<string, number>()
    for (const r of data) {
      if (r.brand !== '__other__') sm.set(r.brand, (sm.get(r.brand) ?? 0) + r.converted_sales)
    }
    return [...sm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b)
  }, [data])

  // Table view rows — aggregated by brand or category, filtered by search, then sorted
  const tableRows = useMemo(() => {
    const rows = aggregate(data, tableTab)
    const q = search.toLowerCase().trim()
    const filtered = q ? rows.filter(r => r.labels.some(l => l.toLowerCase().includes(q))) : rows
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.col)
      const vb = sortValue(b, sort.col)
      const c = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? c : -c
    })
  }, [data, tableTab, search, sort])

  // Pagination — reset to page 1 whenever the dataset, search, or sort changes
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [tableTab, search, sort])
  const totalPages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedRows  = useMemo(
    () => tableRows.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE),
    [tableRows, safePage],
  )

  // Total row across ALL currently displayed (filtered) rows — grand total, not just this page
  const tableTotals = useMemo(() => tableRows.reduce(
    (acc, r) => {
      acc.qty += r.qty; acc.revenue += r.revenue; acc.online += r.online; acc.offline += r.offline
      return acc
    },
    { qty: 0, revenue: 0, online: 0, offline: 0 },
  ), [tableRows])

  const sortHead = (col: SortCol, label: string, right = false) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className={cn(
        'group flex items-center gap-1 hover:text-foreground transition-colors',
        right && 'w-full justify-end',
      )}
    >
      <span>{label}</span>
      {sort.col === col
        ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
        : <ChevronsUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />}
    </button>
  )

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-lg border text-sm text-muted-foreground">
        No product data available for the selected period
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Product Sales</h3>
          {view === 'bubble' ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Split by Senior Buyer · Dashed ring = Buyer boundary · Bubble = Brand
              · <strong>Double-click</strong> a brand to drill into products
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Converted (HOC-attributed) revenue, aggregated by {tableTab === 'brand' ? 'brand' : tableTab === 'category' ? 'category' : 'item'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-muted/30">
            <button
              onClick={() => setView('bubble')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                view === 'bubble' ? 'bg-white text-[#003DA6] shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Bubble Map
            </button>
            <button
              onClick={() => setView('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                view === 'table' ? 'bg-white text-[#003DA6] shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Table2 className="h-3.5 w-3.5" />Table
            </button>
          </div>

          {/* Search */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search brands or products…"
              className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Color legend */}
      {view === 'bubble' && legendBrands.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-2">
          {legendBrands.map(brand => (
            <span key={brand} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colorMap.get(brand) ?? OTHER_COLOR }}
              />
              {brand}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OTHER_COLOR }} />
            Other Brands
          </span>
        </div>
      )}

      {/* Left / Right split panels — Senior Buyer header inside each frame */}
      {view === 'bubble' && (
        <div ref={containerRef} className="flex" style={{ gap: GAP }}>
          {seniors.map((senior, idx) => {
            const totals = seniorTotals.get(senior)
            const isLeft = idx === 0
            const badgeStyle = isLeft
              ? { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }
              : { background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }

            return (
              <div
                key={senior}
                className="rounded-lg border border-slate-200 overflow-hidden flex flex-col bg-slate-50/40"
                style={{ width: panelW || '50%' }}
              >
                {/* Header row inside the frame */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/80 border-b border-slate-100">
                  <span
                    className="inline-block rounded-full border px-3 py-0.5 text-[11px] font-semibold"
                    style={badgeStyle}
                  >
                    {senior}
                  </span>
                  {totals && (
                    <div className="text-right leading-tight">
                      <div className="text-[12px] font-semibold tabular-nums text-foreground">
                        {fmtBaht(totals.sales)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {fmt(totals.qty)} pcs
                      </div>
                    </div>
                  )}
                </div>

                {/* Bubble panel */}
                {panelW > 0 && (
                  <BubblePanel
                    senior={senior}
                    records={data}
                    colorMap={colorMap}
                    search={search}
                    width={panelW}
                    height={height}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <div className="space-y-3">
          {/* Dataset switch: Brand / Category */}
          <div className="flex flex-wrap items-center gap-2">
            {(['brand', 'category', 'item'] as const).map(id => (
              <button
                key={id}
                onClick={() => changeTableTab(id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  tableTab === id
                    ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                    : 'border-gray-200 text-muted-foreground hover:border-gray-300 hover:text-foreground bg-background',
                )}
              >
                {id === 'brand' ? 'By Brand' : id === 'category' ? 'By Category' : 'By Item'}
              </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">
              {tableRows.length.toLocaleString()} {tableTab === 'brand' ? 'brands' : tableTab === 'category' ? 'categories' : 'items'}
            </span>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {tableTab === 'category' ? (
                    <>
                      <TableHead>{sortHead('label0', 'Senior Buyer')}</TableHead>
                      <TableHead>{sortHead('label1', 'Buyer')}</TableHead>
                    </>
                  ) : (
                    <TableHead>{sortHead('label0', tableTab === 'brand' ? 'Brand' : 'Product ID')}</TableHead>
                  )}
                  <TableHead className="text-right">{sortHead('qty', 'Qty Sold', true)}</TableHead>
                  <TableHead className="text-right">{sortHead('revenue', 'Total Revenue', true)}</TableHead>
                  <TableHead className="text-right">{sortHead('online', 'Online', true)}</TableHead>
                  <TableHead className="text-right pr-4">{sortHead('offline', 'Offline', true)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableTab === 'category' ? 6 : 5} className="h-20 text-center text-sm text-muted-foreground">
                      No results.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {pagedRows.map(r => (
                      <TableRow key={r.key}>
                        {tableTab === 'category' ? (
                          <>
                            <TableCell className="text-sm">{r.labels[0]}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.labels[1]}</TableCell>
                          </>
                        ) : (
                          <TableCell className={cn('text-sm', tableTab === 'item' ? 'font-mono' : 'font-medium')}>{r.labels[0]}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(r.qty)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{fmtBaht(r.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtBaht(r.online)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground pr-4">{fmtBaht(r.offline)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Total / sum row — grand total across all pages */}
                    <TableRow className="border-t-2 bg-muted/40 font-semibold">
                      {tableTab === 'category' ? (
                        <>
                          <TableCell className="text-sm">Total</TableCell>
                          <TableCell />
                        </>
                      ) : (
                        <TableCell className="text-sm">Total</TableCell>
                      )}
                      <TableCell className="text-right tabular-nums text-sm">{fmt(tableTotals.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtBaht(tableTotals.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtBaht(tableTotals.online)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm pr-4">{fmtBaht(tableTotals.offline)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {tableRows.length.toLocaleString()} rows · page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded-md border border-gray-200 bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-gray-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-md border border-gray-200 bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-gray-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
