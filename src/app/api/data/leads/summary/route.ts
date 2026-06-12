import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { CONV, REACHED } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const [stats, tiers, cmgs, agents] = await Promise.all([
      queryOne<{
        total: string
        contacted: string
        converted: string
        total_orders: string
      }>(`
        WITH cs AS (
          SELECT mmid,
            CASE
              WHEN COUNT(*) FILTER (WHERE ${REACHED}) > 0 THEN 'reached'
              ELSE 'called_not_reached'
            END AS contact_status
          FROM telesales_calls
          WHERE first_connected_date IS NOT NULL
          GROUP BY mmid
        ),
        os AS (
          SELECT mmid,
            COUNT(DISTINCT order_number) FILTER (WHERE ${CONV}) AS hoc_orders,
            BOOL_OR(${CONV}) AS is_converted
          FROM sales_hoc_orders
          GROUP BY mmid
        )
        SELECT
          COUNT(*)                                                                          AS total,
          COUNT(*) FILTER (WHERE cs.contact_status IS NOT NULL)                           AS contacted,
          COUNT(*) FILTER (WHERE os.is_converted)                                         AS converted,
          COALESCE(SUM(os.hoc_orders) FILTER (WHERE os.is_converted), 0)                 AS total_orders
        FROM leads l
        LEFT JOIN cs ON cs.mmid = l.mmid
        LEFT JOIN os ON os.mmid = l.mmid
      `),

      query<{ lead_customers: string }>(
        `SELECT DISTINCT lead_customers FROM leads WHERE lead_customers IS NOT NULL ORDER BY lead_customers`
      ),

      query<{ dynamic_cmg: string }>(
        `SELECT DISTINCT dynamic_cmg FROM sales_hoc_orders WHERE dynamic_cmg IS NOT NULL ORDER BY dynamic_cmg`
      ),

      query<{ agent: string }>(
        `SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL AND first_connected_date IS NOT NULL ORDER BY agent`
      ),
    ])

    const res = NextResponse.json({
      ok: true,
      kpi: {
        total:      Number(stats?.total      ?? 0),
        contacted:  Number(stats?.contacted  ?? 0),
        converted:  Number(stats?.converted  ?? 0),
        orders:     Number(stats?.total_orders ?? 0),
      },
      filters: {
        tiers:  tiers.map(r => r.lead_customers),
        cmgs:   cmgs.map(r => r.dynamic_cmg),
        agents: agents.map(r => r.agent),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
