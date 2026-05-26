import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: 'daily' | 'weekly' | 'monthly' =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'

    const truncUnit = interval === 'daily' ? 'day' : interval === 'weekly' ? 'week' : 'month'
    const intervalStr = interval === 'daily' ? '1 day' : interval === 'weekly' ? '7 days' : '1 month'

    const cmg = searchParams.get('cmg') || 'all'
    const channel = searchParams.get('channel') || 'all'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build filters
    const conditions: string[] = []
    const params: any[] = []

    if (cmg !== 'all') {
      params.push(cmg)
      conditions.push(`dynamic_cmg = $${params.length}`)
    }

    if (channel !== 'all') {
      params.push(channel)
      conditions.push(`channel = $${params.length}`)
    }

    if (startDate) {
      params.push(startDate)
      conditions.push(`order_date >= $${params.length}::date`)
    }

    if (endDate) {
      params.push(endDate)
      conditions.push(`order_date <= $${params.length}::date`)
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const sql = `
      WITH customer_periods AS (
        SELECT DISTINCT
          mmid,
          DATE_TRUNC('${truncUnit}', order_date)::date AS period
        FROM sales_hoc_orders
        ${whereClause}
      ),
      customer_stats AS (
        SELECT
          mmid,
          period,
          MIN(period) OVER (PARTITION BY mmid) AS first_period,
          LAG(period) OVER (PARTITION BY mmid ORDER BY period) AS prev_period,
          LEAD(period) OVER (PARTITION BY mmid ORDER BY period) AS next_period
        FROM customer_periods
      ),
      categorized AS (
        SELECT
          mmid,
          period,
          CASE
            WHEN period = first_period THEN 'new'
            WHEN prev_period = period - INTERVAL '${intervalStr}' THEN 'repeat'
            ELSE 'reactivated'
          END AS cat,
          next_period
        FROM customer_stats
      ),
      active_counts AS (
        SELECT
          period,
          COUNT(DISTINCT mmid) FILTER (WHERE cat = 'new') AS new_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE cat = 'repeat') AS repeat_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE cat = 'reactivated') AS reactivated_customers
        FROM categorized
        GROUP BY period
      ),
      churn_counts AS (
        SELECT
          (period + INTERVAL '${intervalStr}')::date AS churn_period,
          COUNT(DISTINCT mmid) AS churn_customers
        FROM categorized
        WHERE next_period IS NULL OR next_period > period + INTERVAL '${intervalStr}'
        GROUP BY 1
      )
      SELECT
        COALESCE(a.period, c.churn_period) AS period,
        CASE 
          WHEN '${interval}' = 'daily'  THEN TO_CHAR(COALESCE(a.period, c.churn_period), 'DD Mon')
          WHEN '${interval}' = 'weekly' THEN 'W' || TO_CHAR(COALESCE(a.period, c.churn_period), 'IW-YY')
          ELSE TO_CHAR(COALESCE(a.period, c.churn_period), 'YYYY-MM')
        END AS period_label,
        COALESCE(a.new_customers, 0) AS new_customers,
        COALESCE(a.repeat_customers, 0) AS repeat_customers,
        COALESCE(a.reactivated_customers, 0) AS reactivated_customers,
        -COALESCE(c.churn_customers, 0) AS churn_customers
      FROM active_counts a
      FULL OUTER JOIN churn_counts c ON a.period = c.churn_period
      ORDER BY period;
    `

    const rows = await query<{
      period: string
      period_label: string
      new_customers: number
      repeat_customers: number
      reactivated_customers: number
      churn_customers: number
    }>(sql, params)

    const data = rows.map(r => ({
      period: r.period,
      period_label: r.period_label,
      new_customers: Number(r.new_customers ?? 0),
      repeat_customers: Number(r.repeat_customers ?? 0),
      reactivated_customers: Number(r.reactivated_customers ?? 0),
      churn_customers: Number(r.churn_customers ?? 0),
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
