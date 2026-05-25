import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: 'daily' | 'weekly' | 'monthly' =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const conditions: string[] = []
    const params: any[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`order_date >= $${params.length}::date`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`order_date <= $${params.length}::date`)
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    let sql: string
    if (interval === 'monthly') {
      sql = `
        SELECT
          month AS period,
          MAX(month_label) || ' ' || EXTRACT(YEAR FROM MAX(order_date))::text AS period_label,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')              AS new_customer,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                 AS retention,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'first_order_not_converted') AS first_order_not_converted,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention_not_converted')   AS retention_not_converted
        FROM mart_telesales_orders
        ${whereClause}
        GROUP BY month
        ORDER BY month
      `
    } else if (interval === 'weekly') {
      sql = `
        SELECT
          DATE_TRUNC('week', order_date)::date AS period,
          MAX(week_label) AS period_label,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')              AS new_customer,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                 AS retention,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'first_order_not_converted') AS first_order_not_converted,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention_not_converted')   AS retention_not_converted
        FROM mart_telesales_orders
        ${whereClause}
        GROUP BY DATE_TRUNC('week', order_date)::date
        ORDER BY period
      `
    } else {
      sql = `
        SELECT
          order_date AS period,
          TO_CHAR(order_date, 'DD Mon') AS period_label,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')              AS new_customer,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')                 AS retention,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'first_order_not_converted') AS first_order_not_converted,
          COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention_not_converted')   AS retention_not_converted
        FROM mart_telesales_orders
        ${whereClause}
        GROUP BY order_date
        ORDER BY order_date
      `
    }

    const rows = await query<{
      period: string
      period_label: string
      new_customer: string
      retention: string
      first_order_not_converted: string
      retention_not_converted: string
    }>(sql, params)

    const data = rows.map(r => ({
      period: r.period,
      period_label: r.period_label,
      new_customer: Number(r.new_customer ?? 0),
      retention: Number(r.retention ?? 0),
      first_order_not_converted: Number(r.first_order_not_converted ?? 0),
      retention_not_converted: Number(r.retention_not_converted ?? 0),
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
