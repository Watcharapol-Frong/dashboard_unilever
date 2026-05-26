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
          month,
          dynamic_cmg,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'online'), 0) AS online_sales,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'offline'), 0) AS offline_sales,
          COUNT(DISTINCT order_number) FILTER (WHERE channel = 'online') AS online_orders,
          COUNT(DISTINCT order_number) FILTER (WHERE channel = 'offline') AS offline_orders,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'online' AND customer_type = 'new_customer') AS online_new_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'offline' AND customer_type = 'new_customer') AS offline_new_customers,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'online' AND customer_type = 'retention') AS online_retention,
          COUNT(DISTINCT mmid) FILTER (WHERE channel = 'offline' AND customer_type = 'retention') AS offline_retention
        FROM mart_telesales_orders
        GROUP BY month, dynamic_cmg
      )
      SELECT
        p.month::text,
        TO_CHAR(p.month, 'FMMonth') AS month_label,
        p.dynamic_cmg,
        p.total_calls,
        p.reached,
        p.ordered,
        p.new_customers,
        p.retention,
        p.hoc_orders,
        p.hoc_sales,
        p.sales_target,
        p.achievement_ratio,
        p.incentive_per_head,
        p.total_incentive,
        p.total_agent_cost,
        p.total_expense,
        p.roi,
        COALESCE(c.online_sales, 0) AS online_sales,
        COALESCE(c.offline_sales, 0) AS offline_sales,
        COALESCE(c.online_orders, 0) AS online_orders,
        COALESCE(c.offline_orders, 0) AS offline_orders,
        COALESCE(c.online_new_customers, 0) AS online_new_customers,
        COALESCE(c.offline_new_customers, 0) AS offline_new_customers,
        COALESCE(c.online_retention, 0) AS online_retention,
        COALESCE(c.offline_retention, 0) AS offline_retention
      FROM mart_performance p
      LEFT JOIN channel_metrics c ON c.month = p.month AND c.dynamic_cmg = p.dynamic_cmg
      ORDER BY p.month, p.dynamic_cmg
    `)

    const data = rows.map(r => ({
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
