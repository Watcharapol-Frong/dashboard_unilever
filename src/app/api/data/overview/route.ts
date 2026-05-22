import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const rows = await query<{
      month: string
      month_label: string
      lead_customers: string
      dynamic_cmg: string
      total_calls: number
      reached: number
      ordered: number
      new_customers: number
      retention: number
      hoc_orders: number
      hoc_sales: string
      actual_sales: string
      sales_target: string
      achievement_ratio: string
      incentive_per_head: string
      total_incentive: string
      total_agent_cost: string
      total_expense: string
      roi: string
    }>(`
      SELECT
        month::text,
        TO_CHAR(month, 'FMMonth') AS month_label,
        lead_customers,
        dynamic_cmg,
        total_calls,
        reached,
        ordered,
        new_customers,
        retention,
        hoc_orders,
        hoc_sales,
        actual_sales,
        sales_target,
        achievement_ratio,
        incentive_per_head,
        total_incentive,
        total_agent_cost,
        total_expense,
        roi
      FROM mart_performance
      ORDER BY month, lead_customers, dynamic_cmg
    `)

    const data = rows.map(r => ({
      month:             r.month,
      month_label:       r.month_label,
      lead_customers:    r.lead_customers,
      dynamic_cmg:       r.dynamic_cmg,
      total_calls:       Number(r.total_calls ?? 0),
      reached:           Number(r.reached ?? 0),
      ordered:           Number(r.ordered ?? 0),
      new_customers:     Number(r.new_customers ?? 0),
      retention:         Number(r.retention ?? 0),
      hoc_orders:        Number(r.hoc_orders ?? 0),
      hoc_sales:         Number(r.hoc_sales ?? 0),
      actual_sales:      Number(r.actual_sales ?? 0),
      sales_target:      Number(r.sales_target ?? 0),
      achievement_ratio: Number(r.achievement_ratio ?? 0),
      incentive_per_head:Number(r.incentive_per_head ?? 0),
      total_incentive:   Number(r.total_incentive ?? 0),
      total_agent_cost:  Number(r.total_agent_cost ?? 0),
      total_expense:     Number(r.total_expense ?? 0),
      roi:               Number(r.roi ?? 0),
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
