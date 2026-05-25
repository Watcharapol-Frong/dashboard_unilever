import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const brands      = searchParams.get('brands')      || 'all'
    const className   = searchParams.get('class_name')  || 'all'
    const seniorBuyer = searchParams.get('senior_buyer') || 'all'
    const buyer       = searchParams.get('buyer')       || 'all'
    const subclass    = searchParams.get('subclass')    || 'all'

    const { where: extraWhere, params: filterParams } = buildProductWhere(
      brands, className, seniorBuyer, buyer, subclass,
    )

    const [kpiRow, productRows, brandRows, optsRaw] = await Promise.all([
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
          SUM(m.sales_qty)::text      AS total_qty,
          SUM(m.sales_in_vat)::text   AS total_sales
        FROM mart_telesales_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        WHERE true ${extraWhere}
        GROUP BY m.prod_num, p.brands, p.product_name_th, p.product_name_en,
                 p.class_name, p.subclass, p.senior_buyer_name, p.buyer_name
        ORDER BY SUM(m.sales_in_vat) DESC
      `, filterParams),

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
        WHERE true ${extraWhere}
        GROUP BY COALESCE(p.brands, 'Unknown')
        ORDER BY SUM(m.sales_in_vat) DESC
      `, filterParams),

      // Filter options — always unfiltered so dropdowns stay complete
      query<{
        brands: string | null
        class_name: string | null
        senior_buyer_name: string | null
        buyer_name: string | null
        subclass: string | null
      }>(`
        SELECT DISTINCT
          brands,
          class_name,
          senior_buyer_name,
          buyer_name,
          subclass
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
        pct_of_total:      totalSales > 0 ? sales / totalSales : 0,
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

    const unique = <T,>(arr: (T | null)[]) =>
      [...new Set(arr.filter((v): v is T => v !== null && v !== ''))]

    return NextResponse.json({
      ok: true,
      data: {
        by_product,
        by_brand,
        total_sales:     totalSales,
        total_qty:       totalQty,
        total_skus:      totalSkus,
        total_orders:    totalOrders,
        avg_order_value: totalOrders > 0 ? totalSales / totalOrders : 0,
        options: {
          brands:       unique(optsRaw.map(r => r.brands)).sort(),
          class_names:  unique(optsRaw.map(r => r.class_name)).sort(),
          senior_buyers: unique(optsRaw.map(r => r.senior_buyer_name)).sort(),
          buyers:       unique(optsRaw.map(r => r.buyer_name)).sort(),
          subclasses:   unique(optsRaw.map(r => r.subclass)).sort(),
        },
      },
    })
  })
}
