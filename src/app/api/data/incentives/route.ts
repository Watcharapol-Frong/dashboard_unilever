import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAuth(async () => {
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

    // 3. Monthly Incentives & Performance Expenses (dynamic computation)
    const monthlySummary = await query<{
      month: string
      total_incentive: string
      total_agent_cost: string
      total_expense: string
      roi: string
      achievement_ratio: string
      incentive_hoc_sales: string
      sales_target: string
      incentive_per_head: string
    }>(`
      WITH cmg_sales AS (
        SELECT
          m.month,
          m.total_agent_cost,
          SUM(c.hoc_sales) FILTER (
            WHERE m.month < '2026-05-01' OR c.dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER')
          ) AS incentive_hoc_sales,
          SUM(c.sales_target) FILTER (
            WHERE m.month < '2026-05-01' OR c.dynamic_cmg IN ('FOOD RETAILER', 'HORECA', 'END USER')
          ) AS sales_target
        FROM mart_performance_month m
        LEFT JOIN mart_performance_cmg c ON c.month = m.month
        GROUP BY m.month, m.total_agent_cost
      ),
      achievement AS (
        SELECT
          month,
          total_agent_cost,
          incentive_hoc_sales,
          sales_target,
          CASE
            WHEN COALESCE(sales_target, 0) > 0 THEN incentive_hoc_sales / sales_target
            ELSE 0
          END AS achievement_ratio
        FROM cmg_sales
      ),
      incentive_lookup AS (
        SELECT
          a.month,
          a.total_agent_cost,
          a.incentive_hoc_sales,
          a.sales_target,
          a.achievement_ratio,
          COALESCE((
            SELECT i.incentive_per_head
            FROM incentives i
            WHERE i.tier <= a.achievement_ratio
            ORDER BY i.tier DESC
            LIMIT 1
          ), 0) AS incentive_per_head,
          COALESCE(ah.agent_count, 0) AS agent_count
        FROM achievement a
        LEFT JOIN agent_headcount ah ON ah.month = a.month
      )
      SELECT
        month::text,
        (agent_count * incentive_per_head)::text                                       AS total_incentive,
        total_agent_cost::text                                                          AS total_agent_cost,
        (agent_count * incentive_per_head + COALESCE(total_agent_cost, 0))::text       AS total_expense,
        (CASE
          WHEN (agent_count * incentive_per_head + COALESCE(total_agent_cost, 0)) > 0
          THEN incentive_hoc_sales / (agent_count * incentive_per_head + COALESCE(total_agent_cost, 0))
          ELSE 0
        END)::text                                                                      AS roi,
        achievement_ratio::text,
        incentive_per_head::text,
        incentive_hoc_sales::text,
        sales_target::text
      FROM incentive_lookup
      ORDER BY month DESC
    `).catch(() => [] as any[])

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
        incentive_hoc_sales: Number(m.incentive_hoc_sales), // FOOD RETAILER + HORECA only
        sales_target: Number(m.sales_target),
        incentive_per_head: Number(m.incentive_per_head),
      })),
    }

    const res = NextResponse.json({ ok: true, data })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
