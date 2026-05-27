import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 500

export async function GET(req: NextRequest) {
  return withAdmin(async () => {
    const sp      = req.nextUrl.searchParams
    const page    = Math.max(1, Number(sp.get('page')  ?? 1))
    const limit   = Math.min(PAGE_SIZE, Math.max(1, Number(sp.get('limit') ?? PAGE_SIZE)))
    const search  = sp.get('search')?.trim()  || null
    const tier    = (sp.get('tier')    || '').split(',').filter(Boolean)
    const contact = (sp.get('contact') || '').split(',').filter(Boolean)
    const conv    = (sp.get('conv')    || '').split(',').filter(Boolean)
    const cmg     = (sp.get('cmg')     || '').split(',').filter(Boolean)
    const agent   = (sp.get('agent')   || '').split(',').filter(Boolean)

    const offset = (page - 1) * limit

    const params: (string | number | string[] | null)[] = []
    const conditions: string[] = []

    if (tier.length > 0)    { params.push(tier);    conditions.push(`l.lead_customers = ANY($${params.length})`) }
    if (contact.length > 0) { params.push(contact); conditions.push(`COALESCE(cs.contact_status,'not_called') = ANY($${params.length})`) }
    if (conv.length > 0)    { params.push(conv);    conditions.push(`CASE WHEN os.is_converted THEN 'converted' WHEN os.mmid IS NOT NULL THEN 'not_converted' ELSE 'no_hoc_order' END = ANY($${params.length})`) }
    if (cmg.length > 0)     { params.push(cmg);     conditions.push(`l.mmid IN (SELECT mmid FROM sales_hoc_orders WHERE dynamic_cmg = ANY($${params.length}))`) }
    if (agent.length > 0)   { params.push(agent);   conditions.push(`l.mmid IN (SELECT mmid FROM telesales_calls WHERE agent = ANY($${params.length}) AND first_connected_date IS NOT NULL)`) }
    if (search)  { params.push(`%${search}%`); conditions.push(`(l.mmid ILIKE $${params.length} OR COALESCE(l.cust_name,'') ILIKE $${params.length})`) }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit);  const limitIdx  = params.length
    params.push(offset); const offsetIdx = params.length

    const rows = await query<{
      mmid:              string
      cust_name:         string | null
      lead_customers:    string
      contact_status:    string
      agent:             string | null
      dynamic_cmg:       string | null
      conversion_status: string
      hoc_orders:        string
      hoc_sales:         string
      total_count:       string
    }>(`
      WITH cs AS (
        SELECT mmid,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
            ) > 0 THEN 'reached'
            ELSE 'called_not_reached'
          END AS contact_status,
          MAX(agent) AS agent
        FROM telesales_calls
        WHERE first_connected_date IS NOT NULL
        GROUP BY mmid
      ),
      os AS (
        SELECT mmid,
          COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
          COALESCE(SUM(sales_in_vat)   FILTER (WHERE customer_type IN ('new_customer','retention')), 0) AS hoc_sales,
          BOOL_OR(customer_type IN ('new_customer','retention')) AS is_converted,
          MAX(dynamic_cmg) AS dynamic_cmg
        FROM sales_hoc_orders
        GROUP BY mmid
      ),
      base AS (
        SELECT
          l.mmid,
          l.cust_name,
          l.lead_customers,
          COALESCE(cs.contact_status, 'not_called') AS contact_status,
          cs.agent,
          os.dynamic_cmg,
          CASE
            WHEN os.is_converted      THEN 'converted'
            WHEN os.mmid IS NOT NULL  THEN 'not_converted'
            ELSE                           'no_hoc_order'
          END AS conversion_status,
          COALESCE(os.hoc_orders, 0) AS hoc_orders,
          COALESCE(os.hoc_sales,  0) AS hoc_sales
        FROM leads l
        LEFT JOIN cs ON cs.mmid = l.mmid
        LEFT JOIN os ON os.mmid = l.mmid
        ${whereClause}
      )
      SELECT *, COUNT(*) OVER() AS total_count
      FROM base
      ORDER BY lead_customers, mmid
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params)

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0
    const data  = rows.map(r => ({
      mmid:              r.mmid,
      cust_name:         r.cust_name ?? '',
      lead_customers:    r.lead_customers,
      contact_status:    r.contact_status,
      agent:             r.agent ?? null,
      dynamic_cmg:       r.dynamic_cmg ?? null,
      conversion_status: r.conversion_status,
      hoc_orders:        Number(r.hoc_orders),
      hoc_sales:         Number(r.hoc_sales),
    }))

    const res = NextResponse.json({ ok: true, data, total, page, limit })
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
    return res
  })
}
