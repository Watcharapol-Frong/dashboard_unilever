import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAuth(async () => {
    const rows = await query<{
      month: string
      month_label: string
      dynamic_cmg: string
      total_calls: number
      reached: number
      ordered: number
      new_customers: number
      retention: number
      hoc_orders: number
      hoc_sales: string
      sales_target: string
      achievement_ratio: string
      incentive_per_head: string
      total_incentive: string
      total_agent_cost: string
      total_expense: string
      roi: string
      online_sales: string
      offline_sales: string
      online_orders: string
      offline_orders: string
      online_new_customers: string
      offline_new_customers: string
      online_retention: string
      offline_retention: string
    }>(`
      WITH channel_metrics AS (
        SELECT
          month, dynamic_cmg,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'online'), 0)                                  AS online_sales,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'offline'), 0)                                 AS offline_sales,
          COUNT(DISTINCT order_number) FILTER (WHERE channel = 'online')                                    AS online_orders,
          COUNT(DISTINCT order_number) FILTER (WHERE channel = 'offline')                                   AS offline_orders,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'online'  AND customer_type = 'new_customer')        AS online_new_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'offline' AND customer_type = 'new_customer')        AS offline_new_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'online'  AND customer_type = 'retention')           AS online_retention,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'offline' AND customer_type = 'retention')           AS offline_retention
        FROM sales_hoc_orders
        GROUP BY month, dynamic_cmg
      )
      SELECT
        c.month::text,
        TO_CHAR(c.month, 'FMMonth') AS month_label,
        c.dynamic_cmg,
        COALESCE(m.total_calls, 0)      AS total_calls,
        COALESCE(m.reached, 0)          AS reached,
        c.ordered,
        c.new_customers,
        c.retention,
        c.hoc_orders,
        c.hoc_sales,
        c.sales_target,
        c.achievement_ratio,
        COALESCE(m.incentive_per_head, 0) AS incentive_per_head,
        COALESCE(m.total_incentive, 0)    AS total_incentive,
        COALESCE(m.total_agent_cost, 0)   AS total_agent_cost,
        COALESCE(m.total_expense, 0)      AS total_expense,
        COALESCE(m.roi, 0)                AS roi,
        COALESCE(ch.online_sales, 0)           AS online_sales,
        COALESCE(ch.offline_sales, 0)          AS offline_sales,
        COALESCE(ch.online_orders, 0)          AS online_orders,
        COALESCE(ch.offline_orders, 0)         AS offline_orders,
        COALESCE(ch.online_new_customers, 0)   AS online_new_customers,
        COALESCE(ch.offline_new_customers, 0)  AS offline_new_customers,
        COALESCE(ch.online_retention, 0)       AS online_retention,
        COALESCE(ch.offline_retention, 0)      AS offline_retention
      FROM mart_performance_cmg c
      LEFT JOIN mart_performance_month m  ON m.month = c.month
      LEFT JOIN channel_metrics ch        ON ch.month = c.month AND ch.dynamic_cmg = c.dynamic_cmg
      ORDER BY c.month, c.dynamic_cmg
    `).catch((err: unknown) => {
      console.error('[overview] query error:', err)
      throw err
    })

    const data = rows.map((r: any) => ({
      month:             r.month,
      month_label:       r.month_label,
      dynamic_cmg:       r.dynamic_cmg,
      total_calls:       Number(r.total_calls ?? 0),
      reached:           Number(r.reached ?? 0),
      ordered:           Number(r.ordered ?? 0),
      new_customers:     Number(r.new_customers ?? 0),
      retention:         Number(r.retention ?? 0),
      hoc_orders:        Number(r.hoc_orders ?? 0),
      hoc_sales:         Number(r.hoc_sales ?? 0),
      sales_target:      Number(r.sales_target ?? 0),
      achievement_ratio: Number(r.achievement_ratio ?? 0),
      incentive_per_head:Number(r.incentive_per_head ?? 0),
      total_incentive:   Number(r.total_incentive ?? 0),
      total_agent_cost:  Number(r.total_agent_cost ?? 0),
      total_expense:     Number(r.total_expense ?? 0),
      roi:               Number(r.roi ?? 0),
      online_sales:      Number(r.online_sales ?? 0),
      offline_sales:     Number(r.offline_sales ?? 0),
      online_orders:     Number(r.online_orders ?? 0),
      offline_orders:    Number(r.offline_orders ?? 0),
      online_new_customers: Number(r.online_new_customers ?? 0),
      offline_new_customers: Number(r.offline_new_customers ?? 0),
      online_retention:  Number(r.online_retention ?? 0),
      offline_retention: Number(r.offline_retention ?? 0),
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
