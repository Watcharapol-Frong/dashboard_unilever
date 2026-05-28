import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: 'daily' | 'weekly' | 'monthly' =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'

    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const channel   = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg       = (searchParams.get('cmg')     || '').split(',').filter(Boolean)

    const conditions: string[] = []
    const params: any[] = []

    // Use month column for month-level date filtering (matches Overview range chips)
    if (startDate) {
      params.push(startDate)
      conditions.push(`month >= $${params.length}::date`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`month <= $${params.length}::date`)
    }
    if (channel.length > 0) {
      params.push(channel)
      conditions.push(`channel = ANY($${params.length})`)
    }
    if (cmg.length > 0) {
      params.push(cmg)
      conditions.push(`dynamic_cmg = ANY($${params.length})`)
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
        FROM sales_hoc_orders
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
        FROM sales_hoc_orders
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
        FROM sales_hoc_orders
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
      period:                    r.period,
      period_label:              r.period_label,
      new_customer:              Number(r.new_customer ?? 0),
      retention:                 Number(r.retention ?? 0),
      first_order_not_converted: Number(r.first_order_not_converted ?? 0),
      retention_not_converted:   Number(r.retention_not_converted ?? 0),
    }))

    const res = NextResponse.json({ ok: true, data })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
