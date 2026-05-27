import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Builds WHERE clauses for telesales_calls (bare + tc.-prefixed) and the
// agent_conversions CTE for sales_hoc_orders — all from one set of params.
function buildFilters(
  startDate: string | null,
  endDate: string | null,
  agent: string[],
  channel: string[],
  cmg: string[],
) {
  const params: any[] = []
  const bare: string[]     = ['first_connected_date IS NOT NULL']
  const prefixed: string[] = ['tc.first_connected_date IS NOT NULL']
  // order_date is intentionally NOT date-filtered — customer_type already encodes
  // the attribution window, so a retention order outside the call period still counts
  const orderConds: string[] = [`customer_type IN ('new_customer', 'retention')`]

  const push = (v: any) => { params.push(v); return params.length }

  if (startDate) {
    const i = push(startDate)
    bare.push(`first_connected_date >= $${i}::date`)
    prefixed.push(`tc.first_connected_date >= $${i}::date`)
    // NOT added to orderConds — do not restrict by order_date
  }
  if (endDate) {
    const i = push(endDate)
    bare.push(`first_connected_date <= $${i}::date`)
    prefixed.push(`tc.first_connected_date <= $${i}::date`)
    // NOT added to orderConds
  }
  if (agent.length > 0) {
    const i = push(agent)
    bare.push(`agent = ANY($${i})`)
    prefixed.push(`tc.agent = ANY($${i})`)
  }
  if (channel.length > 0 || cmg.length > 0) {
    // Channel filter: use sales_hoc_orders (HOC orders)
    // CMG filter: use mart_telesales_orders.primary_cmg (covers all called mmids)
    if (channel.length > 0) {
      const i = push(channel)
      bare.push(`mmid IN (SELECT DISTINCT mmid FROM sales_hoc_orders WHERE channel = ANY($${i}))`)
      prefixed.push(`tc.mmid IN (SELECT DISTINCT mmid FROM sales_hoc_orders WHERE channel = ANY($${i}))`)
      orderConds.push(`channel = ANY($${i})`)
    }
    if (cmg.length > 0) {
      const i = push(cmg)
      bare.push(`mmid IN (SELECT DISTINCT mmid FROM mart_telesales_orders WHERE primary_cmg = ANY($${i}))`)
      prefixed.push(`tc.mmid IN (SELECT DISTINCT mmid FROM mart_telesales_orders WHERE primary_cmg = ANY($${i}))`)
      orderConds.push(`dynamic_cmg = ANY($${i})`)
    }
  }

  return {
    params,
    where:   'WHERE ' + bare.join(' AND '),
    whereTc: 'WHERE ' + prefixed.join(' AND '),
    agentConvCTE: `WITH agent_conversions AS (
      SELECT DISTINCT mmid FROM sales_hoc_orders
      WHERE ${orderConds.join(' AND ')}
    )`,
  }
}

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const channel   = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg       = (searchParams.get('cmg')     || '').split(',').filter(Boolean)
    const agent     = (searchParams.get('agent')   || '').split(',').filter(Boolean)

    const { params, where, whereTc, agentConvCTE } =
      buildFilters(startDate, endDate, agent, channel, cmg)

    const [leadsRow, totalConvertedRow, summaryRow] = await Promise.all([
      queryOne<{ total_leads: string }>(`
        SELECT COUNT(DISTINCT mmid)::text AS total_leads FROM leads
      `),
      queryOne<{ total_converted: string; new_converted: string; repeat_converted: string }>(`
        ${agentConvCTE}
        SELECT
          COUNT(DISTINCT tc.mmid)::text AS total_converted,
          COUNT(DISTINCT tc.mmid) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM sales_hoc_orders o
              WHERE o.mmid = tc.mmid AND o.customer_type = 'new_customer'
            )
          )::text AS new_converted,
          COUNT(DISTINCT tc.mmid) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM sales_hoc_orders o
              WHERE o.mmid = tc.mmid AND o.customer_type = 'retention'
            )
          )::text AS repeat_converted
        FROM telesales_calls tc
        JOIN agent_conversions ac ON ac.mmid = tc.mmid
        ${whereTc}
      `, params),
      queryOne<{ total_calls: string; reached: string }>(`
        SELECT
          COUNT(DISTINCT mmid)::text AS total_calls,
          COUNT(DISTINCT mmid) FILTER (
            WHERE call_status NOT LIKE 'ไม่รับสาย%'
              AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
          )::text AS reached
        FROM telesales_calls
        ${where}
      `, params),
    ])

    const totalLeads     = Number(leadsRow?.total_leads ?? 0)
    const totalConverted = Number(totalConvertedRow?.total_converted ?? 0)
    const newConverted   = Number(totalConvertedRow?.new_converted   ?? 0)
    const repeatConverted = Number(totalConvertedRow?.repeat_converted ?? 0)
    const totalCalls     = Number(summaryRow?.total_calls ?? 0)
    const reached        = Number(summaryRow?.reached ?? 0)

    const [tierStatusRows, agentRows, trendRows, monthsRaw, cmgOpts, agentOpts] = await Promise.all([
      // Call status breakdown by tier
      query<{ tier: string; call_status: string; cnt: string }>(`
        SELECT
          COALESCE(lead_customers, 'Unspecified') AS tier,
          COALESCE(call_status, 'Unspecified')    AS call_status,
          COUNT(*)::text AS cnt
        FROM telesales_calls
        ${where}
        GROUP BY 1, 2
      `, params),

      // Agent performance
      query<{ agent: string; total_calls: string; reached: string; converted: string; unique_days: string }>(`
        ${agentConvCTE}
        SELECT
          COALESCE(tc.agent, 'Unknown') AS agent,
          COUNT(*)::text AS total_calls,
          COUNT(*) FILTER (
            WHERE tc.call_status NOT LIKE 'ไม่รับสาย%'
              AND tc.call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
          )::text AS reached,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE ac.mmid IS NOT NULL)::text AS converted,
          COUNT(DISTINCT tc.first_connected_date)::text AS unique_days
        FROM telesales_calls tc
        LEFT JOIN agent_conversions ac ON ac.mmid = tc.mmid
        ${whereTc}
        GROUP BY 1
        ORDER BY total_calls DESC
      `, params),

      // Calling trend by day
      query<{ period: string; total_calls: string; converted: string }>(`
        ${agentConvCTE}
        SELECT
          tc.first_connected_date::text AS period,
          COUNT(*)::text AS total_calls,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE ac.mmid IS NOT NULL)::text AS converted
        FROM telesales_calls tc
        LEFT JOIN agent_conversions ac ON ac.mmid = tc.mmid
        ${whereTc}
        GROUP BY tc.first_connected_date
        ORDER BY tc.first_connected_date
      `, params),

      // Static options (unfiltered) — months, CMG list, agent list
      query<{ month: string }>(`
        SELECT DISTINCT DATE_TRUNC('month', first_connected_date)::date::text AS month
        FROM telesales_calls WHERE first_connected_date IS NOT NULL ORDER BY month
      `),
      query<{ cmg: string }>(`
        SELECT DISTINCT primary_cmg AS cmg FROM mart_telesales_orders
        WHERE primary_cmg IS NOT NULL ORDER BY primary_cmg
      `),
      query<{ agent: string }>(`
        SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL ORDER BY agent
      `),
    ])

    const call_status_breakdown: Record<string, number> = {}
    const callStatusMap: Record<string, number> = {}
    const by_tier_status: { tier: string; call_status: string; count: number }[] = []
    tierStatusRows.forEach(r => {
      const c = Number(r.cnt)
      by_tier_status.push({ tier: r.tier, call_status: r.call_status, count: c })
      call_status_breakdown[r.call_status] = (call_status_breakdown[r.call_status] || 0) + c
      callStatusMap[r.call_status] = (callStatusMap[r.call_status] || 0) + c
    })

    const by_agent = agentRows.map(r => {
      const tc   = Number(r.total_calls)
      const rc   = Number(r.reached)
      const conv = Number(r.converted)
      const days = Number(r.unique_days) || 1
      return {
        agent: r.agent,
        total_calls: tc,
        reached: rc,
        not_reached: tc - rc,
        reach_rate: tc > 0 ? rc / tc : 0,
        conversion_rate: rc > 0 ? conv / rc : 0,
        calls_per_day: tc / days,
      }
    })

    const res = NextResponse.json({
      ok: true,
      data: {
        summary: {
          total_leads: totalLeads,
          total_calls: totalCalls,
          reached,
          not_reached: totalCalls - reached,
          total_converted: totalConverted,
          new_converted: newConverted,
          repeat_converted: repeatConverted,
          call_status_breakdown,
        },
        by_agent,
        by_period: trendRows.map(r => ({
          period: r.period,
          total_calls: Number(r.total_calls),
          converted: Number(r.converted),
        })),
        by_tier_status,
        callStatusMap,
        months: monthsRaw.map(r => r.month),
        options: {
          cmg:    cmgOpts.map(o => o.cmg).filter(Boolean),
          agents: agentOpts.map(o => o.agent).filter(Boolean),
        },
      },
    })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
