import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]
  const from  = searchParams.get('from')  ?? monthStart
  const to    = searchParams.get('to')    ?? today
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const supabase = createServiceClient()

  const [topProductsRes, totalsRes] = await Promise.all([
    supabase.rpc('get_top_products', { p_from: from, p_to: to, p_limit: limit }),
    supabase.rpc('get_sales_totals', { p_from: from, p_to: to }),
  ])

  const products: {
    prod_num: string
    brands: string | null
    product_name_th: string | null
    product_name_en: string | null
    is_uni_hoc_pd: boolean
    total_qty: number
    total_sales: number
  }[] = topProductsRes.data ?? []

  const salesRows = totalsRes.data ?? []
  const onlineRow  = salesRows.find((r: { channel: string }) => r.channel === 'Online')
  const offlineRow = salesRows.find((r: { channel: string }) => r.channel === 'Offline')
  const total_revenue = Number(onlineRow?.total_sales ?? 0) + Number(offlineRow?.total_sales ?? 0)

  // Add pct_of_total
  const by_product = products.map(p => ({
    ...p,
    total_qty:    Number(p.total_qty),
    total_sales:  Number(p.total_sales),
    pct_of_total: total_revenue > 0 ? Number(p.total_sales) / total_revenue : 0,
  }))

  // Brand-level rollup
  const brandMap = new Map<string, { brands: string; total_sales: number; total_qty: number; product_count: number }>()
  for (const p of by_product) {
    const brand = p.brands ?? 'Unknown'
    if (!brandMap.has(brand)) brandMap.set(brand, { brands: brand, total_sales: 0, total_qty: 0, product_count: 0 })
    const b = brandMap.get(brand)!
    b.total_sales   += p.total_sales
    b.total_qty     += p.total_qty
    b.product_count += 1
  }
  const by_brand = [...brandMap.values()]
    .map(b => ({ ...b, pct_of_total: total_revenue > 0 ? b.total_sales / total_revenue : 0 }))
    .sort((a, b) => b.total_sales - a.total_sales)

  // Unilever HOC products only
  const uni_products = by_product.filter(p => p.is_uni_hoc_pd)
  const uni_revenue  = uni_products.reduce((s, p) => s + p.total_sales, 0)

  return NextResponse.json({
    by_product,
    by_brand,
    total_revenue,
    uni_revenue,
    uni_revenue_pct: total_revenue > 0 ? uni_revenue / total_revenue : 0,
    uni_product_count: uni_products.length,
  })
}
