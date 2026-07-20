import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 500

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const sp      = req.nextUrl.searchParams
    const page    = Math.max(1, Number(sp.get('page')  ?? 1))
    const limit   = Math.min(PAGE_SIZE, Math.max(1, Number(sp.get('limit') ?? PAGE_SIZE)))
    const search  = sp.get('search')?.trim() || null
    const tier    = sp.get('tier')           || null
    const contact = sp.get('contact')        || null
    const conv    = sp.get('conv')           || null
    const cmgParam   = sp.get('cmg')
    const agentParam = sp.get('agent')
    const cmgArr   = cmgParam   ? cmgParam.split(',').map(s => s.trim()).filter(Boolean)   : []
    const agentArr = agentParam ? agentParam.split(',').map(s => s.trim()).filter(Boolean) : []

    const offset = (page - 1) * limit

    const params: (string | number | string[] | null)[] = []
    const conditions: string[] = []

    if (tier)    { params.push(tier);    conditions.push(`l.lead_customers = $${params.length}`) }
    if (contact) { params.push(contact); conditions.push(`COALESCE(f.contact_status,'not_called') = $${params.length}`) }
    if (conv)    { params.push(conv);    conditions.push(`CASE WHEN f.is_converted THEN 'converted' WHEN f.mmid IS NOT NULL THEN 'not_converted' ELSE 'no_hoc_order' END = $${params.length}`) }
    if (cmgArr.length > 0)   { params.push(cmgArr);   conditions.push(`f.primary_cmg = ANY($${params.length})`) }
    if (agentArr.length > 0) { params.push(agentArr); conditions.push(`f.agent = ANY($${params.length})`) }
    if (search)  { params.push(`%${search}%`); conditions.push(`(l.mmid ILIKE $${params.length} OR COALESCE(l.cust_name,'') ILIKE $${params.length})`) }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit);  const limitIdx  = params.length
    params.push(offset); const offsetIdx = params.length

    const rows = await query<{
      mmid:              string
      cust_name:         string | null
      lead_customers:    string
      contact_status:    string
      agent:             string | null
      primary_cmg:       string | null
      conversion_status: string
      hoc_orders:        string
      hoc_sales:         string
      total_count:       string
    }>(`
      WITH base AS (
        SELECT
          l.mmid,
          l.cust_name,
          l.lead_customers,
          COALESCE(f.contact_status, 'not_called') AS contact_status,
          f.agent,
          f.primary_cmg,
          CASE
            WHEN f.is_converted     THEN 'converted'
            WHEN f.mmid IS NOT NULL THEN 'not_converted'
            ELSE                         'no_hoc_order'
          END AS conversion_status,
          COALESCE(f.hoc_orders, 0) AS hoc_orders,
          COALESCE(f.hoc_sales,  0) AS hoc_sales
        FROM leads l
        LEFT JOIN mart_telesales_funnel f ON f.mmid = l.mmid
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
      primary_cmg:       r.primary_cmg ?? null,
      conversion_status: r.conversion_status,
      hoc_orders:        Number(r.hoc_orders),
      hoc_sales:         Number(r.hoc_sales),
    }))

    const res = NextResponse.json({ ok: true, data, total, page, limit })
    setCacheHeader(res, 'SHORT')
    return res
  })
}
