import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    // 1. Get Grand Total Revenue of ALL sales (before filtering for Unilever HOC)
    const grandTotalRow = await queryOne<{ total_revenue: string }>(`
      SELECT (
        SELECT COALESCE(SUM(sales_in_vat), 0) FROM online_sales
      ) + (
        SELECT COALESCE(SUM(sales_in_vat), 0) FROM offline_sales
      ) AS total_revenue
    `)

    // 2. Get Unilever HOC Revenue
    const uniTotalRow = await queryOne<{ uni_revenue: string }>(`
      SELECT COALESCE(SUM(sales_in_vat), 0)::text AS uni_revenue
      FROM sales_hoc_all
    `)

    // 3. Get Unilever product count
    const uniProductCountRow = await queryOne<{ uni_product_count: string }>(`
      SELECT COUNT(*)::text AS uni_product_count
      FROM products
      WHERE product_name_en IS NOT NULL
    `)

    // 4. Products performance table
    const productRows = await query<{
      prod_num: string
      brands: string | null
      product_name_th: string | null
      product_name_en: string | null
      total_qty: string
      total_sales: string
    }>(`
      SELECT
        prod_num,
        brands,
        product_name_th,
        product_name_en,
        SUM(sales_qty)::text AS total_qty,
        SUM(sales_in_vat)::text AS total_sales
      FROM sales_hoc_all
      GROUP BY prod_num, brands, product_name_th, product_name_en
      ORDER BY SUM(sales_in_vat) DESC
    `)

    // 5. Brands performance table
    const brandRows = await query<{
      brands: string | null
      total_sales: string
      total_qty: string
      product_count: string
    }>(`
      SELECT
        COALESCE(brands, 'Unbranded') AS brands,
        SUM(sales_in_vat)::text AS total_sales,
        SUM(sales_qty)::text AS total_qty,
        COUNT(DISTINCT prod_num)::text AS product_count
      FROM sales_hoc_all
      GROUP BY COALESCE(brands, 'Unbranded')
      ORDER BY SUM(sales_in_vat) DESC
    `)

    const totalRevenue = Number(grandTotalRow?.total_revenue ?? 0)
    const uniRevenue = Number(uniTotalRow?.uni_revenue ?? 0)

    const by_product = productRows.map(p => {
      const sales = Number(p.total_sales)
      return {
        prod_num: p.prod_num,
        brands: p.brands,
        product_name_th: p.product_name_th,
        product_name_en: p.product_name_en,
        is_uni_hoc_pd: true,
        total_qty: Number(p.total_qty),
        total_sales: sales,
        pct_of_total: uniRevenue > 0 ? (sales / uniRevenue) : 0,
      }
    })

    const by_brand = brandRows.map(b => {
      const sales = Number(b.total_sales)
      return {
        brands: b.brands ?? 'Unbranded',
        total_sales: sales,
        total_qty: Number(b.total_qty),
        product_count: Number(b.product_count),
        pct_of_total: uniRevenue > 0 ? (sales / uniRevenue) : 0,
      }
    })

    const data = {
      by_product,
      by_brand,
      total_revenue: totalRevenue,
      uni_revenue: uniRevenue,
      uni_revenue_pct: totalRevenue > 0 ? (uniRevenue / totalRevenue) : 0,
      uni_product_count: Number(uniProductCountRow?.uni_product_count ?? 0),
    }

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
