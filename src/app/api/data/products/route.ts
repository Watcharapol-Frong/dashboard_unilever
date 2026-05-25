import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const [kpiRow, productRows, brandRows] = await Promise.all([
      queryOne<{
        total_sales: string
        total_qty: string
        total_skus: string
        total_orders: string
      }>(`
        SELECT
          COALESCE(SUM(sales_in_vat), 0)::text       AS total_sales,
          COALESCE(SUM(sales_qty), 0)::text           AS total_qty,
          COUNT(DISTINCT prod_num)::text              AS total_skus,
          COUNT(DISTINCT order_number)::text          AS total_orders
        FROM mart_telesales_orders
      `),

      query<{
        prod_num: string
        brands: string | null
        product_name_th: string | null
        product_name_en: string | null
        total_qty: string
        total_sales: string
      }>(`
        SELECT
          m.prod_num,
          p.brands,
          p.product_name_th,
          p.product_name_en,
          SUM(m.sales_qty)::text      AS total_qty,
          SUM(m.sales_in_vat)::text   AS total_sales
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        GROUP BY m.prod_num, p.brands, p.product_name_th, p.product_name_en
        ORDER BY SUM(m.sales_in_vat) DESC
      `),

      query<{
        brands: string
        total_sales: string
        total_qty: string
        product_count: string
      }>(`
        SELECT
          COALESCE(p.brands, 'Unknown') AS brands,
          SUM(m.sales_in_vat)::text     AS total_sales,
          SUM(m.sales_qty)::text        AS total_qty,
          COUNT(DISTINCT m.prod_num)::text AS product_count
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        GROUP BY COALESCE(p.brands, 'Unknown')
        ORDER BY SUM(m.sales_in_vat) DESC
      `),
    ])

    const totalSales = Number(kpiRow?.total_sales ?? 0)
    const totalQty   = Number(kpiRow?.total_qty   ?? 0)
    const totalSkus  = Number(kpiRow?.total_skus  ?? 0)
    const totalOrders = Number(kpiRow?.total_orders ?? 0)

    const by_product = productRows.map(p => {
      const sales = Number(p.total_sales)
      return {
        prod_num:        p.prod_num,
        brands:          p.brands,
        product_name_th: p.product_name_th,
        product_name_en: p.product_name_en,
        is_uni_hoc_pd:   true,
        total_qty:       Number(p.total_qty),
        total_sales:     sales,
        pct_of_total:    totalSales > 0 ? sales / totalSales : 0,
      }
    })

    const by_brand = brandRows.map(b => {
      const sales = Number(b.total_sales)
      return {
        brands:        b.brands,
        total_sales:   sales,
        total_qty:     Number(b.total_qty),
        product_count: Number(b.product_count),
        pct_of_total:  totalSales > 0 ? sales / totalSales : 0,
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        by_product,
        by_brand,
        total_sales:  totalSales,
        total_qty:    totalQty,
        total_skus:   totalSkus,
        total_orders: totalOrders,
        avg_order_value: totalOrders > 0 ? totalSales / totalOrders : 0,
      },
    })
  })
}
