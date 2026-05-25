import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    // 1. Get Incentive Tiers
    const tiers = await query<{
      tier: string
      incentive_per_head: string
    }>(`
      SELECT
        tier::text,
        incentive_per_head::text
      FROM incentives
      ORDER BY tier ASC
    `)

    // 2. Get Headcount & Costs history
    const headcountCosts = await query<{
      month: string
      cost_per_agent: string | null
      cost_per_supervisor: string | null
      supervisor_count: string | null
      agent_count: string | null
    }>(`
      SELECT
        COALESCE(c.month, h.month)::text AS month,
        c.cost_per_agent::text,
        c.cost_per_supervisor::text,
        h.supervisor_count::text,
        h.agent_count::text
      FROM costs c
      FULL OUTER JOIN agent_headcount h ON h.month = c.month
      ORDER BY COALESCE(c.month, h.month) DESC
    `)

    // 3. Monthly Incentives & Performance Expenses
    const monthlySummary = await query<{
      month: string
      total_incentive: string
      total_agent_cost: string
      total_expense: string
      roi: string
      achievement_ratio: string
      hoc_sales: string
      sales_target: string
      incentive_per_head: string
    }>(`
      WITH monthly AS (
        SELECT
          month,
          SUM(total_incentive)  AS total_incentive,
          SUM(total_agent_cost) AS total_agent_cost,
          SUM(total_expense)    AS total_expense,
          AVG(roi)              AS roi,
          CASE WHEN SUM(sales_target) > 0
               THEN SUM(hoc_sales) / SUM(sales_target)
               ELSE 0 END       AS achievement_ratio,
          SUM(hoc_sales)        AS hoc_sales,
          SUM(sales_target)     AS sales_target
        FROM mart_performance
        GROUP BY month
      )
      SELECT
        m.month::text,
        m.total_incentive::text,
        m.total_agent_cost::text,
        m.total_expense::text,
        m.roi::text,
        m.achievement_ratio::text,
        m.hoc_sales::text,
        m.sales_target::text,
        COALESCE(i.incentive_per_head, 0)::text AS incentive_per_head
      FROM monthly m
      LEFT JOIN LATERAL (
        SELECT incentive_per_head
        FROM incentives
        WHERE tier <= m.achievement_ratio
        ORDER BY tier DESC
        LIMIT 1
      ) i ON true
      ORDER BY m.month DESC
    `)

    const data = {
      incentive_tiers: tiers.map(t => ({
        tier: Number(t.tier),
        incentive_per_head: Number(t.incentive_per_head),
      })),
      headcount_costs: headcountCosts.map(hc => ({
        month: hc.month,
        cost_per_agent: hc.cost_per_agent ? Number(hc.cost_per_agent) : 0,
        cost_per_supervisor: hc.cost_per_supervisor ? Number(hc.cost_per_supervisor) : 0,
        supervisor_count: hc.supervisor_count ? Number(hc.supervisor_count) : 0,
        agent_count: hc.agent_count ? Number(hc.agent_count) : 0,
      })),
      monthly_summary: monthlySummary.map(m => ({
        month: m.month,
        total_incentive: Number(m.total_incentive),
        total_agent_cost: Number(m.total_agent_cost),
        total_expense: Number(m.total_expense),
        roi: Number(m.roi),
        achievement_ratio: Number(m.achievement_ratio) * 100, // convert ratio to %
        hoc_sales: Number(m.hoc_sales),
        sales_target: Number(m.sales_target),
        incentive_per_head: Number(m.incentive_per_head),
      })),
    }

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
