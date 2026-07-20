import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAuth(async () => {
    const [stats, tiers, cmgs, agents] = await Promise.all([
      queryOne<{
        total: string; contacted: string; converted: string; total_orders: string
      }>(`
        SELECT
          COUNT(*)                                       AS total,
          COUNT(*) FILTER (WHERE f.contact_status IS NOT NULL) AS contacted,
          COUNT(*) FILTER (WHERE f.is_converted)          AS converted,
          COALESCE(SUM(COALESCE(f.hoc_orders, 0)), 0)     AS total_orders
        FROM leads l
        LEFT JOIN mart_telesales_funnel f ON f.mmid = l.mmid
      `),

      query<{ lead_customers: string }>(
        `SELECT DISTINCT lead_customers FROM leads WHERE lead_customers IS NOT NULL ORDER BY lead_customers`
      ),

      query<{ primary_cmg: string }>(
        `SELECT DISTINCT primary_cmg FROM mmid_cmg_map WHERE primary_cmg IS NOT NULL ORDER BY primary_cmg`
      ),

      query<{ agent: string }>(
        `SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL AND first_connected_date IS NOT NULL ORDER BY agent`
      ),
    ])

    const res = NextResponse.json({
      ok: true,
      kpi: {
        total:    Number(stats?.total        ?? 0),
        contacted: Number(stats?.contacted   ?? 0),
        converted: Number(stats?.converted   ?? 0),
        orders:    Number(stats?.total_orders ?? 0),
      },
      filters: {
        tiers:  tiers.map(r => r.lead_customers),
        cmgs:   cmgs.map(r => r.primary_cmg),
        agents: agents.map(r => r.agent),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
