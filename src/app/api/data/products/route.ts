import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { push as qpush, addDateRange, addFilter, setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

function buildProductWhere(
  brands: string[],
  className: string[],
  seniorBuyer: string[],
  buyer: string[],
  subclass: string[],
  startDate: string | null,
  endDate: string | null,
) {
  const conditions: string[] = []
  const params: any[] = []

  addDateRange(params, conditions, startDate, endDate, 'm.order_date')
  addFilter(params, conditions, brands, 'm.brands')
  addFilter(params, conditions, className, 'm.class_name')
  if (seniorBuyer.length > 0) {
    conditions.push(`m.prod_num IN (SELECT prod_num FROM products WHERE senior_buyer_name = ANY(${qpush(params, seniorBuyer)}))`)
  }
  if (buyer.length > 0) {
    conditions.push(`m.prod_num IN (SELECT prod_num FROM products WHERE buyer_name = ANY(${qpush(params, buyer)}))`)
  }
  addFilter(params, conditions, subclass, 'm.subclass')

  return { where: conditions.length ? 'AND ' + conditions.join(' AND ') : '', params }
}

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const brands      = (searchParams.get('brands')       || '').split(',').filter(Boolean)
    const className   = (searchParams.get('class_name')   || '').split(',').filter(Boolean)
    const seniorBuyer = (searchParams.get('senior_buyer') || '').split(',').filter(Boolean)
    const buyer       = (searchParams.get('buyer')        || '').split(',').filter(Boolean)
    const subclass    = (searchParams.get('subclass')     || '').split(',').filter(Boolean)
    const startDate   = searchParams.get('startDate')   || null
    const endDate     = searchParams.get('endDate')     || null

    const { where: extraWhere, params: filterParams } = buildProductWhere(
      brands, className, seniorBuyer, buyer, subclass, startDate, endDate,
    )

    const [kpiRow, productRows, brandRows, monthsRaw, brandTrendRows] = await Promise.all([
      // ── KPI totals ───────────────────────────────────────────────────────
      queryOne<{
        total_sales: string
        total_qty: string
        total_skus: string
        total_orders: string
      }>(`
        SELECT
          COALESCE(SUM(m.sales_in_vat), 0)::text     AS total_sales,
          COALESCE(SUM(m.sales_qty), 0)::text         AS total_qty,
          COUNT(DISTINCT m.prod_num)::text            AS total_skus,
          COUNT(DISTINCT m.order_number)::text        AS total_orders
        FROM sales_hoc_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
      `, filterParams),

      // ── By product (SKU level) with new/retention counts ─────────────────
      query<{
        prod_num: string
        brands: string | null
        product_name_th: string | null
        product_name_en: string | null
        class_name: string | null
        subclass: string | null
        senior_buyer_name: string | null
        buyer_name: string | null
        total_qty: string
        total_sales: string
        new_customers: string
        retention_customers: string
      }>(`
        SELECT
          m.prod_num,
          m.brands,
          m.product_name_th,
          m.product_name_en,
          m.class_name,
          m.subclass,
          p.senior_buyer_name,
          p.buyer_name,
          SUM(m.sales_qty)::text                                                            AS total_qty,
          SUM(m.sales_in_vat)::text                                                        AS total_sales,
          COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'new_customer')::text     AS new_customers,
          COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'retention')::text        AS retention_customers
        FROM sales_hoc_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
        GROUP BY m.prod_num, m.brands, m.product_name_th, m.product_name_en,
                 m.class_name, m.subclass, p.senior_buyer_name, p.buyer_name
        ORDER BY SUM(m.sales_in_vat) DESC
      `, filterParams),

      // ── By brand (summary + channel split) ──────────────────────────────
      query<{
        brands: string
        total_sales: string
        online_sales: string
        offline_sales: string
        total_qty: string
        product_count: string
      }>(`
        SELECT
          COALESCE(m.brands, 'Unknown')                                                    AS brands,
          SUM(m.sales_in_vat)::text                                                        AS total_sales,
          COALESCE(SUM(CASE WHEN m.channel = 'online'  THEN m.sales_in_vat END), 0)::text AS online_sales,
          COALESCE(SUM(CASE WHEN m.channel = 'offline' THEN m.sales_in_vat END), 0)::text AS offline_sales,
          SUM(m.sales_qty)::text                                                            AS total_qty,
          COUNT(DISTINCT m.prod_num)::text                                                  AS product_count
        FROM sales_hoc_orders m
        WHERE true ${extraWhere}
        GROUP BY COALESCE(m.brands, 'Unknown')
        ORDER BY SUM(m.sales_in_vat) DESC
      `, filterParams),

      // ── Available months (unfiltered, for range chips) ──────────────────
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month FROM sales_hoc_orders ORDER BY month
      `),

      // ── Brand revenue trend — top 3 brands × month + Other ─────────────
      query<{
        month: string
        month_label: string
        brands: string
        total_sales: string
      }>(`
        WITH top3 AS (
          SELECT COALESCE(m.brands, 'Unknown') AS brands
          FROM sales_hoc_orders m
          WHERE true ${extraWhere}
          GROUP BY 1
          ORDER BY SUM(m.sales_in_vat) DESC
          LIMIT 3
        )
        SELECT
          m.month::text                                                                AS month,
          MAX(m.month_label) || ' ' || EXTRACT(YEAR FROM MAX(m.order_date))::text     AS month_label,
          CASE
            WHEN COALESCE(m.brands, 'Unknown') IN (SELECT brands FROM top3)
            THEN COALESCE(m.brands, 'Unknown')
            ELSE 'Other'
          END                                                                          AS brands,
          SUM(m.sales_in_vat)::text                                                   AS total_sales
        FROM sales_hoc_orders m
        WHERE true ${extraWhere}
        GROUP BY
          m.month,
          CASE
            WHEN COALESCE(m.brands, 'Unknown') IN (SELECT brands FROM top3)
            THEN COALESCE(m.brands, 'Unknown')
            ELSE 'Other'
          END
        ORDER BY m.month
      `, filterParams),

    ])

    const totalSales  = Number(kpiRow?.total_sales  ?? 0)
    const totalQty    = Number(kpiRow?.total_qty    ?? 0)
    const totalSkus   = Number(kpiRow?.total_skus   ?? 0)
    const totalOrders = Number(kpiRow?.total_orders ?? 0)

    const by_product = productRows.map(p => {
      const sales = Number(p.total_sales)
      return {
        prod_num:          p.prod_num,
        brands:            p.brands,
        product_name_th:   p.product_name_th,
        product_name_en:   p.product_name_en,
        class_name:        p.class_name,
        subclass:          p.subclass,
        senior_buyer_name: p.senior_buyer_name,
        buyer_name:        p.buyer_name,
        is_uni_hoc_pd:     true,
        total_qty:         Number(p.total_qty),
        total_sales:       sales,
        new_customers:     Number(p.new_customers),
        retention_customers: Number(p.retention_customers),
        pct_of_total:      totalSales > 0 ? sales / totalSales : 0,
      }
    })

    const by_brand = brandRows.map(b => {
      const sales   = Number(b.total_sales)
      const online  = Number(b.online_sales)
      const offline = Number(b.offline_sales)
      return {
        brands:          b.brands,
        total_sales:     sales,
        online_sales:    online,
        offline_sales:   offline,
        online_pct:      sales > 0 ? online  / sales : 0,
        offline_pct:     sales > 0 ? offline / sales : 0,
        total_qty:       Number(b.total_qty),
        product_count:   Number(b.product_count),
        pct_of_total:    totalSales > 0 ? sales / totalSales : 0,
      }
    })

    // Pivot brand trend: [{ month_label, Brand_A: n, Brand_B: n, ... }]
    const monthOrder   = [...new Set(brandTrendRows.map(r => r.month))].sort()
    // Keep top3 in descending-sales order, "Other" always last
    const namedBrands  = [...new Set(brandTrendRows.filter(r => r.brands !== 'Other').map(r => r.brands))]
    const hasOther     = brandTrendRows.some(r => r.brands === 'Other')
    const top5Brands   = hasOther ? [...namedBrands, 'Other'] : namedBrands
    const by_brand_trend = monthOrder.map(month => {
      const label = brandTrendRows.find(r => r.month === month)?.month_label ?? month
      const row: Record<string, string | number> = { month, month_label: label }
      top5Brands.forEach(brand => {
        const entry = brandTrendRows.find(r => r.month === month && r.brands === brand)
        row[brand] = entry ? Number(entry.total_sales) : 0
      })
      return row
    })

    const res = NextResponse.json({
      ok: true,
      data: {
        by_product,
        by_brand,
        by_brand_trend,
        top5_brands: top5Brands,
        total_sales:     totalSales,
        total_qty:       totalQty,
        total_skus:      totalSkus,
        total_orders:    totalOrders,
        avg_order_value: totalOrders > 0 ? totalSales / totalOrders : 0,
        months: monthsRaw.map(r => r.month),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
