import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const from  = searchParams.get('from')  ?? monthStart
  const to    = searchParams.get('to')    ?? today
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const [products, totalsRows] = await Promise.all([
    query<{ prod_num: string; brands: string|null; product_name_th: string|null; product_name_en: string|null; is_uni_hoc_pd: boolean; total_qty: string; total_sales: string }>(
      `SELECT s.prod_num, p.brands, p.product_name_th, p.product_name_en,
         (p.product_name_en IS NOT NULL) AS is_uni_hoc_pd,
         SUM(s.sales_qty) AS total_qty, SUM(s.sales_in_vat) AS total_sales
       FROM (
         SELECT prod_num, sales_qty, sales_in_vat, order_date FROM online_sales
         UNION ALL
         SELECT prod_num, sales_qty, sales_in_vat, order_date FROM offline_sales
       ) s LEFT JOIN products p ON p.prod_num = s.prod_num
       WHERE s.order_date BETWEEN $1 AND $2
       GROUP BY s.prod_num, p.brands, p.product_name_th, p.product_name_en
       ORDER BY total_sales DESC LIMIT $3`,
      [from, to, limit]
    ),
    query<{ channel: string; total_sales: string }>(
      `SELECT 'Online' AS channel, COALESCE(SUM(sales_in_vat),0) AS total_sales FROM online_sales WHERE order_date BETWEEN $1 AND $2
       UNION ALL SELECT 'Offline', COALESCE(SUM(sales_in_vat),0) FROM offline_sales WHERE order_date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ])

  const total_revenue = totalsRows.reduce((s, r) => s + Number(r.total_sales), 0)

  const by_product = products.map(p => ({
    ...p,
    total_qty:   Number(p.total_qty),
    total_sales: Number(p.total_sales),
    pct_of_total: total_revenue > 0 ? Number(p.total_sales) / total_revenue : 0,
  }))

  const brandMap = new Map<string, { brands: string; total_sales: number; total_qty: number; product_count: number }>()
  for (const p of by_product) {
    const brand = p.brands ?? 'Unknown'
    if (!brandMap.has(brand)) brandMap.set(brand, { brands: brand, total_sales: 0, total_qty: 0, product_count: 0 })
    const b = brandMap.get(brand)!
    b.total_sales += p.total_sales; b.total_qty += p.total_qty; b.product_count += 1
  }
  const by_brand = [...brandMap.values()]
    .map(b => ({ ...b, pct_of_total: total_revenue > 0 ? b.total_sales / total_revenue : 0 }))
    .sort((a, b) => b.total_sales - a.total_sales)

  const uni_products = by_product.filter(p => p.is_uni_hoc_pd)
  const uni_revenue  = uni_products.reduce((s, p) => s + p.total_sales, 0)

  return NextResponse.json({
    by_product, by_brand, total_revenue, uni_revenue,
    uni_revenue_pct: total_revenue > 0 ? uni_revenue / total_revenue : 0,
    uni_product_count: uni_products.length,
  })
}
