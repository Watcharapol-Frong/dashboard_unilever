import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const channel = searchParams.get('channel') || 'all'
    const cmg = searchParams.get('cmg') || 'all'
    const agent = searchParams.get('agent') || 'all'

    const conditions: string[] = ['first_connected_date IS NOT NULL']
    const params: string[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`first_connected_date >= $${params.length}::date`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`first_connected_date <= $${params.length}::date`)
    }
    if (agent !== 'all') {
      params.push(agent)
      conditions.push(`agent = $${params.length}`)
    }
    if (channel !== 'all' || cmg !== 'all') {
      const subConditions: string[] = []
      if (channel !== 'all') {
        params.push(channel)
        subConditions.push(`channel = $${params.length}`)
      }
      if (cmg !== 'all') {
        params.push(cmg)
        subConditions.push(`dynamic_cmg = $${params.length}`)
      }
      conditions.push(`mmid IN (
        SELECT DISTINCT mmid FROM mart_telesales_orders
        WHERE ${subConditions.join(' AND ')}
      )`)
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ')
    const whereClauseTc = 'WHERE ' + conditions.map(c => 
      c.replace(/first_connected_date/g, 'tc.first_connected_date')
       .replace(/agent =/g, 'tc.agent =')
    ).join(' AND ')

    // 1. Leads, Conversions, and Summary totals
    const [leadsRow, totalConvertedRow, summaryRow] = await Promise.all([
      queryOne<{ total_leads: string }>(`
        SELECT COUNT(DISTINCT mmid)::text AS total_leads FROM leads
      `),
      queryOne<{ total_converted: string }>(`
        WITH agent_conversions AS (
          SELECT DISTINCT mmid FROM mart_telesales_orders
          WHERE customer_type IN ('new_customer', 'retention')
            ${startDate ? `AND order_date >= $1::date` : ''}
            ${endDate ? `AND order_date <= $${startDate ? '2' : '1'}::date` : ''}
            ${channel !== 'all' ? `AND channel = $${params.indexOf(channel) + 1}` : ''}
            ${cmg !== 'all' ? `AND dynamic_cmg = $${params.indexOf(cmg) + 1}` : ''}
        )
        SELECT COUNT(DISTINCT tc.mmid)::text AS total_converted
        FROM telesales_calls tc
        JOIN agent_conversions ac ON ac.mmid = tc.mmid
        ${whereClauseTc}
      `, params),
      queryOne<{
        total_calls: string
        reached: string
      }>(`
        SELECT
          COUNT(*)::text AS total_calls,
          COUNT(*) FILTER (
            WHERE call_status NOT LIKE 'ไม่รับสาย%'
              AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
              AND call_status IS DISTINCT FROM 'ไม่สะดวกคุย'
              AND call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'
          )::text AS reached
        FROM telesales_calls
        ${whereClause}
      `, params)
    ])

    const totalLeads = Number(leadsRow?.total_leads ?? 0)
    const totalConverted = Number(totalConvertedRow?.total_converted ?? 0)
    const totalCalls = Number(summaryRow?.total_calls ?? 0)
    const reached = Number(summaryRow?.reached ?? 0)
    const notReached = totalCalls - reached

    // 2. Call status breakdown by Tier
    const tierStatusRows = await query<{ tier: string; call_status: string; cnt: string }>(`
      SELECT
        COALESCE(lead_customers, 'Unspecified') AS tier,
        COALESCE(call_status, 'Unspecified') AS call_status,
        COUNT(*)::text AS cnt
      FROM telesales_calls
      ${whereClause}
      GROUP BY COALESCE(lead_customers, 'Unspecified'), COALESCE(call_status, 'Unspecified')
    `, params)

    const call_status_breakdown: Record<string, number> = {}
    const callStatusMap: Record<string, number> = {}
    const by_tier_status: { tier: string; call_status: string; count: number }[] = []

    tierStatusRows.forEach(r => {
      const c = Number(r.cnt)
      by_tier_status.push({ tier: r.tier, call_status: r.call_status, count: c })
      call_status_breakdown[r.call_status] = (call_status_breakdown[r.call_status] || 0) + c
      callStatusMap[r.call_status] = (callStatusMap[r.call_status] || 0) + c
    })

    // 3. Agent Performance
    const agentRows = await query<{
      agent: string
      total_calls: string
      reached: string
      converted: string
      unique_days: string
    }>(`
      WITH agent_conversions AS (
        SELECT DISTINCT mmid FROM mart_telesales_orders
        WHERE customer_type IN ('new_customer', 'retention')
          ${startDate ? `AND order_date >= $1::date` : ''}
          ${endDate ? `AND order_date <= $${startDate ? '2' : '1'}::date` : ''}
          ${channel !== 'all' ? `AND channel = $${params.indexOf(channel) + 1}` : ''}
          ${cmg !== 'all' ? `AND dynamic_cmg = $${params.indexOf(cmg) + 1}` : ''}
      )
      SELECT
        COALESCE(tc.agent, 'Unknown') AS agent,
        COUNT(*)::text AS total_calls,
        COUNT(*) FILTER (
          WHERE tc.call_status NOT LIKE 'ไม่รับสาย%'
            AND tc.call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
            AND tc.call_status IS DISTINCT FROM 'ไม่สะดวกคุย'
            AND tc.call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'
        )::text AS reached,
        COUNT(DISTINCT tc.mmid) FILTER (
          WHERE ac.mmid IS NOT NULL
        )::text AS converted,
        COUNT(DISTINCT tc.first_connected_date)::text AS unique_days
      FROM telesales_calls tc
      LEFT JOIN agent_conversions ac ON ac.mmid = tc.mmid
      ${whereClauseTc}
      GROUP BY COALESCE(tc.agent, 'Unknown')
      ORDER BY total_calls DESC
    `, params)

    const by_agent = agentRows.map(r => {
      const tc = Number(r.total_calls)
      const rc = Number(r.reached)
      const conv = Number(r.converted)
      const days = Number(r.unique_days) || 1

      return {
        agent: r.agent,
        total_calls: tc,
        reached: rc,
        not_reached: tc - rc,
        reach_rate: tc > 0 ? (rc / tc) : 0,
        conversion_rate: rc > 0 ? (conv / rc) : 0,
        calls_per_day: tc / days,
      }
    })

    // 4. Calling trend by period (day/week)
    const trendRows = await query<{
      period: string
      total_calls: string
      converted: string
    }>(`
      WITH agent_conversions AS (
        SELECT DISTINCT mmid FROM mart_telesales_orders
        WHERE customer_type IN ('new_customer', 'retention')
          ${startDate ? `AND order_date >= $1::date` : ''}
          ${endDate ? `AND order_date <= $${startDate ? '2' : '1'}::date` : ''}
          ${channel !== 'all' ? `AND channel = $${params.indexOf(channel) + 1}` : ''}
          ${cmg !== 'all' ? `AND dynamic_cmg = $${params.indexOf(cmg) + 1}` : ''}
      )
      SELECT
        tc.first_connected_date::text AS period,
        COUNT(*)::text AS total_calls,
        COUNT(DISTINCT tc.mmid) FILTER (WHERE ac.mmid IS NOT NULL)::text AS converted
      FROM telesales_calls tc
      LEFT JOIN agent_conversions ac ON ac.mmid = tc.mmid
      ${whereClauseTc}
      GROUP BY tc.first_connected_date
      ORDER BY tc.first_connected_date
    `, params)

    const by_period = trendRows.map(r => ({
      period: r.period,
      total_calls: Number(r.total_calls),
      converted: Number(r.converted),
    }))

    // 5. Available months for range chips (unfiltered) and filter options
    const [monthsRaw, cmgOpts, agentOpts] = await Promise.all([
      query<{ month: string }>(`
        SELECT DISTINCT DATE_TRUNC('month', first_connected_date)::date::text AS month
        FROM telesales_calls
        WHERE first_connected_date IS NOT NULL
        ORDER BY month
      `),
      query<{ cmg: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg
        FROM mart_telesales_orders
        WHERE dynamic_cmg IS NOT NULL
        ORDER BY dynamic_cmg
      `),
      query<{ agent: string }>(`
        SELECT DISTINCT agent
        FROM telesales_calls
        WHERE agent IS NOT NULL
        ORDER BY agent
      `)
    ])

    const data = {
      summary: {
        total_leads: totalLeads,
        total_calls: totalCalls,
        reached,
        not_reached: notReached,
        total_converted: totalConverted,
        call_status_breakdown,
      },
      by_agent,
      by_period,
      by_tier_status,
      callStatusMap,
      months: monthsRaw.map(r => r.month),
      options: {
        cmg: cmgOpts.map(o => o.cmg).filter(Boolean),
        agents: agentOpts.map(o => o.agent).filter(Boolean),
      }
    }

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}

