import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withAdmin(async () => {
    const sp      = req.nextUrl.searchParams
    const tier    = (sp.get('tier')    || '').split(',').filter(Boolean)
    const contact = (sp.get('contact') || '').split(',').filter(Boolean)
    const conv    = (sp.get('conv')    || '').split(',').filter(Boolean)
    const cmg     = (sp.get('cmg')     || '').split(',').filter(Boolean)
    const agent   = (sp.get('agent')   || '').split(',').filter(Boolean)

    const kpiParams: any[] = []
    const kpiConds: string[] = []

    if (tier.length > 0)    { kpiParams.push(tier);    kpiConds.push(`l.lead_customers = ANY($${kpiParams.length})`) }
    if (contact.length > 0) { kpiParams.push(contact); kpiConds.push(`COALESCE(cs.contact_status,'not_called') = ANY($${kpiParams.length})`) }
    if (conv.length > 0)    { kpiParams.push(conv);    kpiConds.push(`CASE WHEN os.is_converted THEN 'converted' WHEN os.mmid IS NOT NULL THEN 'not_converted' ELSE 'no_hoc_order' END = ANY($${kpiParams.length})`) }
    if (cmg.length > 0)     { kpiParams.push(cmg);     kpiConds.push(`l.mmid IN (SELECT mmid FROM sales_hoc_orders WHERE dynamic_cmg = ANY($${kpiParams.length}))`) }
    if (agent.length > 0)   { kpiParams.push(agent);   kpiConds.push(`l.mmid IN (SELECT mmid FROM telesales_calls WHERE agent = ANY($${kpiParams.length}) AND first_connected_date IS NOT NULL)`) }

    const kpiWhere = kpiConds.length > 0 ? 'AND ' + kpiConds.join(' AND ') : ''
    const hasFilter = kpiConds.length > 0

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
              WHEN COUNT(*) FILTER (
                WHERE call_status NOT LIKE 'ไม่รับสาย%'
                  AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
              ) > 0 THEN 'reached'
              ELSE 'called_not_reached'
            END AS contact_status
          FROM telesales_calls
          WHERE first_connected_date IS NOT NULL
          GROUP BY mmid
        ),
        os AS (
          SELECT mmid,
            COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
            BOOL_OR(customer_type IN ('new_customer','retention')) AS is_converted
          FROM sales_hoc_orders
          GROUP BY mmid
        )
        SELECT
          COUNT(*)                                                                     AS total,
          COUNT(*) FILTER (WHERE COALESCE(cs.contact_status,'not_called') != 'not_called') AS contacted,
          COUNT(*) FILTER (WHERE os.is_converted)                                    AS converted,
          COALESCE(SUM(COALESCE(os.hoc_orders, 0)), 0)                              AS total_orders
        FROM leads l
        LEFT JOIN cs ON cs.mmid = l.mmid
        LEFT JOIN os ON os.mmid = l.mmid
        WHERE 1=1 ${kpiWhere}
      `, kpiParams),

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
      filtered: hasFilter,
      filters: {
        tiers:  tiers.map(r => r.lead_customers),
        cmgs:   cmgs.map(r => r.dynamic_cmg),
        agents: agents.map(r => r.agent),
      },
    })
    // No cache when filters are active so KPI stays current
    if (hasFilter) {
      res.headers.set('Cache-Control', 'no-store')
    } else {
      res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    }
    return res
  })
}
