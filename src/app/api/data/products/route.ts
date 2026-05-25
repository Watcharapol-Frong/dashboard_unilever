import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

type TrendInterval = 'monthly' | 'weekly' | 'daily'

function buildProductWhere(
  brands: string,
  className: string,
  seniorBuyer: string,
  buyer: string,
  subclass: string,
) {
  const conditions: string[] = []
  const params: any[] = []

  if (brands      !== 'all') { params.push(brands);      conditions.push(`p.brands = $${params.length}`) }
  if (className   !== 'all') { params.push(className);   conditions.push(`p.class_name = $${params.length}`) }
  if (seniorBuyer !== 'all') { params.push(seniorBuyer); conditions.push(`p.senior_buyer_name = $${params.length}`) }
  if (buyer       !== 'all') { params.push(buyer);       conditions.push(`p.buyer_name = $${params.length}`) }
  if (subclass    !== 'all') { params.push(subclass);    conditions.push(`p.subclass = $${params.length}`) }

  return { where: conditions.length ? 'AND ' + conditions.join(' AND ') : '', params }
}

function trendPeriodExpr(interval: TrendInterval) {
  if (interval === 'daily')  return 'm.order_date'
  if (interval === 'weekly') return "DATE_TRUNC('week', m.order_date)::date"
  return 'm.month'
}

function trendLabelExpr(interval: TrendInterval) {
  if (interval === 'daily')  return "TO_CHAR(m.order_date, 'DD Mon')"
  if (interval === 'weekly') return "MAX(m.week_label)"
  return "MAX(m.month_label) || ' ' || EXTRACT(YEAR FROM MAX(m.order_date))::text"
}

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)

    // Product dimension filters
    const brands      = searchParams.get('brands')      || 'all'
    const className   = searchParams.get('class_name')  || 'all'
    const seniorBuyer = searchParams.get('senior_buyer') || 'all'
    const buyer       = searchParams.get('buyer')       || 'all'
    const subclass    = searchParams.get('subclass')    || 'all'

    // Trend-only params
    const rawInterval  = searchParams.get('trend_interval') ?? 'monthly'
    const trendInterval: TrendInterval =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'
    const trendStart = searchParams.get('trend_start')
    const trendEnd   = searchParams.get('trend_end')

    const { where: extraWhere, params: filterParams } = buildProductWhere(
      brands, className, seniorBuyer, buyer, subclass,
    )

    // Build date range clause for trend query (appended after filterParams)
    const dateConditions: string[] = []
    const dateParams: any[] = []
    if (trendStart) { dateParams.push(trendStart); dateConditions.push(`m.order_date >= $${filterParams.length + dateParams.length}::date`) }
    if (trendEnd)   { dateParams.push(trendEnd);   dateConditions.push(`m.order_date <= $${filterParams.length + dateParams.length}::date`) }
    const dateWhere = dateConditions.length ? 'AND ' + dateConditions.join(' AND ') : ''

    const periodExpr = trendPeriodExpr(trendInterval)
    const labelExpr  = trendLabelExpr(trendInterval)

    const [kpiRow, productRows, brandRows, brandTrendRows, optsRaw] = await Promise.all([
      // ── KPI totals (product filters only, no date range) ─────────────────
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
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
      `, filterParams),

      // ── By product (SKU level) ────────────────────────────────────────────
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
          p.brands,
          p.product_name_th,
          p.product_name_en,
          p.class_name,
          p.subclass,
          p.senior_buyer_name,
          p.buyer_name,
          SUM(m.sales_qty)::text                                                            AS total_qty,
          SUM(m.sales_in_vat)::text                                                        AS total_sales,
          COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'new_customer')::text     AS new_customers,
          COUNT(DISTINCT m.mmid) FILTER (WHERE m.customer_type = 'retention')::text        AS retention_customers
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
        GROUP BY m.prod_num, p.brands, p.product_name_th, p.product_name_en,
                 p.class_name, p.subclass, p.senior_buyer_name, p.buyer_name
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
          COALESCE(p.brands, 'Unknown')                                                    AS brands,
          SUM(m.sales_in_vat)::text                                                        AS total_sales,
          COALESCE(SUM(CASE WHEN m.channel = 'online'  THEN m.sales_in_vat END), 0)::text AS online_sales,
          COALESCE(SUM(CASE WHEN m.channel = 'offline' THEN m.sales_in_vat END), 0)::text AS offline_sales,
          SUM(m.sales_qty)::text                                                            AS total_qty,
          COUNT(DISTINCT m.prod_num)::text                                                  AS product_count
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
        GROUP BY COALESCE(p.brands, 'Unknown')
        ORDER BY SUM(m.sales_in_vat) DESC
      `, filterParams),

      // ── Brand revenue trend — top 5 × period (with date range) ───────────
      query<{
        period: string
        period_label: string
        brands: string
        total_sales: string
      }>(`
        WITH top5 AS (
          SELECT COALESCE(p.brands, 'Unknown') AS brands
          FROM mart_telesales_orders m
          LEFT JOIN products p ON m.prod_num = p.prod_num
          WHERE true ${extraWhere} ${dateWhere}
          GROUP BY 1
          ORDER BY SUM(m.sales_in_vat) DESC
          LIMIT 5
        )
        SELECT
          ${periodExpr}                         AS period,
          ${labelExpr}                          AS period_label,
          COALESCE(p.brands, 'Unknown')         AS brands,
          SUM(m.sales_in_vat)::text             AS total_sales
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE COALESCE(p.brands, 'Unknown') IN (SELECT brands FROM top5)
          ${extraWhere} ${dateWhere}
        GROUP BY ${periodExpr}, COALESCE(p.brands, 'Unknown')
        ORDER BY ${periodExpr}
      `, [...filterParams, ...dateParams, ...filterParams, ...dateParams]),

      // ── Filter options ───────────────────────────────────────────────────
      query<{
        brands: string | null
        class_name: string | null
        senior_buyer_name: string | null
        buyer_name: string | null
        subclass: string | null
      }>(`
        SELECT DISTINCT brands, class_name, senior_buyer_name, buyer_name, subclass
        FROM products
        WHERE prod_num IN (SELECT DISTINCT prod_num FROM mart_telesales_orders)
        ORDER BY brands, class_name
      `),
    ])

    const totalSales  = Number(kpiRow?.total_sales  ?? 0)
    const totalQty    = Number(kpiRow?.total_qty    ?? 0)
    const totalSkus   = Number(kpiRow?.total_skus   ?? 0)
    const totalOrders = Number(kpiRow?.total_orders ?? 0)

    const by_product = productRows.map(p => {
      const sales = Number(p.total_sales)
      return {
        prod_num:            p.prod_num,
        brands:              p.brands,
        product_name_th:     p.product_name_th,
        product_name_en:     p.product_name_en,
        class_name:          p.class_name,
        subclass:            p.subclass,
        senior_buyer_name:   p.senior_buyer_name,
        buyer_name:          p.buyer_name,
        is_uni_hoc_pd:       true,
        total_qty:           Number(p.total_qty),
        total_sales:         sales,
        new_customers:       Number(p.new_customers),
        retention_customers: Number(p.retention_customers),
        pct_of_total:        totalSales > 0 ? sales / totalSales : 0,
      }
    })

    const by_brand = brandRows.map(b => {
      const sales   = Number(b.total_sales)
      const online  = Number(b.online_sales)
      const offline = Number(b.offline_sales)
      return {
        brands:        b.brands,
        total_sales:   sales,
        online_sales:  online,
        offline_sales: offline,
        online_pct:    sales > 0 ? online  / sales : 0,
        offline_pct:   sales > 0 ? offline / sales : 0,
        total_qty:     Number(b.total_qty),
        product_count: Number(b.product_count),
        pct_of_total:  totalSales > 0 ? sales / totalSales : 0,
      }
    })

    // Pivot trend rows → [{ period_label, BrandA: n, BrandB: n, ... }]
    const periodOrder = [...new Set(brandTrendRows.map(r => r.period))].sort()
    const top5Brands  = [...new Set(brandTrendRows.map(r => r.brands))]
    const by_brand_trend = periodOrder.map(period => {
      const label = brandTrendRows.find(r => r.period === period)?.period_label ?? period
      const row: Record<string, string | number> = { period, period_label: label }
      top5Brands.forEach(brand => {
        const entry = brandTrendRows.find(r => r.period === period && r.brands === brand)
        row[brand] = entry ? Number(entry.total_sales) : 0
      })
      return row
    })

    const unique = <T,>(arr: (T | null)[]) =>
      [...new Set(arr.filter((v): v is T => v !== null && v !== ''))]

    return NextResponse.json({
      ok: true,
      data: {
        by_product,
        by_brand,
        by_brand_trend,
        top5_brands:     top5Brands,
        total_sales:     totalSales,
        total_qty:       totalQty,
        total_skus:      totalSkus,
        total_orders:    totalOrders,
        avg_order_value: totalOrders > 0 ? totalSales / totalOrders : 0,
        options: {
          brands:        unique(optsRaw.map(r => r.brands)).sort(),
          class_names:   unique(optsRaw.map(r => r.class_name)).sort(),
          senior_buyers: unique(optsRaw.map(r => r.senior_buyer_name)).sort(),
          buyers:        unique(optsRaw.map(r => r.buyer_name)).sort(),
          subclasses:    unique(optsRaw.map(r => r.subclass)).sort(),
        },
      },
    })
  })
}
