import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    // 1. Summary totals
    const summaryRow = await queryOne<{
      total_calls: string
      reached: string
    }>(`
      SELECT
        COUNT(*)::text AS total_calls,
        COUNT(*) FILTER (
          WHERE call_status NOT LIKE 'ไม่รับสาย%'
            AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
        )::text AS reached
      FROM telesales_calls
      WHERE first_connected_date IS NOT NULL
    `)

    const totalCalls = Number(summaryRow?.total_calls ?? 0)
    const reached = Number(summaryRow?.reached ?? 0)
    const notReached = totalCalls - reached

    // 2. Call status breakdown
    const statusRows = await query<{ call_status: string; cnt: string }>(`
      SELECT call_status, COUNT(*)::text AS cnt
      FROM telesales_calls
      WHERE first_connected_date IS NOT NULL
      GROUP BY call_status
      ORDER BY COUNT(*) DESC
    `)

    const call_status_breakdown: Record<string, number> = {}
    const callStatusMap: Record<string, number> = {}
    statusRows.forEach(r => {
      call_status_breakdown[r.call_status] = Number(r.cnt)
      callStatusMap[r.call_status] = Number(r.cnt)
    })

    // 3. Agent Performance
    // Note: A lead is converted if there's an entry in mart_telesales_orders for that mmid
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
      )
      SELECT
        COALESCE(tc.agent, 'Unknown') AS agent,
        COUNT(*)::text AS total_calls,
        COUNT(*) FILTER (
          WHERE tc.call_status NOT LIKE 'ไม่รับสาย%'
            AND tc.call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
        )::text AS reached,
        COUNT(DISTINCT tc.mmid) FILTER (
          WHERE ac.mmid IS NOT NULL
        )::text AS converted,
        COUNT(DISTINCT tc.first_connected_date)::text AS unique_days
      FROM telesales_calls tc
      LEFT JOIN agent_conversions ac ON ac.mmid = tc.mmid
      WHERE tc.first_connected_date IS NOT NULL
      GROUP BY COALESCE(tc.agent, 'Unknown')
      ORDER BY total_calls DESC
    `)

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
      reached: string
    }>(`
      SELECT
        first_connected_date::text AS period,
        COUNT(*)::text AS total_calls,
        COUNT(*) FILTER (
          WHERE call_status NOT LIKE 'ไม่รับสาย%'
            AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
        )::text AS reached
      FROM telesales_calls
      WHERE first_connected_date IS NOT NULL
      GROUP BY first_connected_date
      ORDER BY first_connected_date
    `)

    const by_period = trendRows.map(r => ({
      period: r.period,
      total_calls: Number(r.total_calls),
      reached: Number(r.reached),
    }))

    const data = {
      summary: {
        total_calls: totalCalls,
        reached,
        not_reached: notReached,
        call_status_breakdown,
      },
      by_agent,
      by_period,
      callStatusMap,
    }

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
