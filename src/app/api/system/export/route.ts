import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const from           = searchParams.get('from')  ?? '2026-02-01'
    const to             = searchParams.get('to')    ?? '2026-04-30'
    const attribution    = Math.min(Math.max(Number(searchParams.get('attribution') ?? 365), 1), 730)

    const rows = await query<{
      channel: string
      dynamic_cmg: string | null
      month: string
      brands: string | null
      prod_num: string | null
      sum_sales: string
      sum_qty: string
      frequency: string
    }>(`
      WITH all_sales AS (
        SELECT order_number, order_date, mmid, prod_num,
               sales_qty, sales_in_vat, dynamic_cmg, 'online' AS channel
          FROM online_sales
        UNION ALL
        SELECT order_number, order_date, mmid, prod_num,
               sales_qty, sales_in_vat, dynamic_cmg, 'offline' AS channel
          FROM offline_sales
      ),
      attributed AS (
        SELECT
          s.channel,
          s.dynamic_cmg,
          DATE_TRUNC('month', s.order_date)::date AS month,
          s.prod_num,
          s.order_number,
          s.sales_qty,
          s.sales_in_vat
        FROM telesales_calls t
        JOIN all_sales s
          ON  s.mmid = t.mmid
          AND s.order_date >= t.first_connected_date
          AND s.order_date <= t.first_connected_date + ($3 || ' days')::interval
        WHERE s.order_date >= $1::date
          AND s.order_date <= $2::date
      )
      SELECT
        a.channel,
        a.dynamic_cmg,
        TO_CHAR(a.month, 'YYYY-MM')            AS month,
        p.brands,
        a.prod_num,
        ROUND(SUM(a.sales_in_vat)::numeric, 2) AS sum_sales,
        SUM(a.sales_qty)                        AS sum_qty,
        COUNT(DISTINCT a.order_number)          AS frequency
      FROM attributed a
      LEFT JOIN products p ON p.prod_num = a.prod_num
      WHERE p.product_name_en IS NOT NULL
      GROUP BY a.channel, a.dynamic_cmg, a.month, p.brands, a.prod_num
      ORDER BY a.month, a.channel, a.dynamic_cmg, p.brands, a.prod_num
    `, [from, to, attribution])

    const header = 'channel,dynamic_cmg,month,brands,prod_num,sum_sales,sum_qty,frequency\n'
    const csvRows = rows.map(r =>
      [
        r.channel,
        r.dynamic_cmg ?? '',
        r.month,
        r.brands ?? '',
        r.prod_num ?? '',
        r.sum_sales,
        r.sum_qty,
        r.frequency,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const filename = `telesales_attributed_${from}_${to}_attr${attribution}d.csv`

    return new NextResponse(header + csvRows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  })
}
