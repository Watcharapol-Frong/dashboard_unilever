import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { CONV } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const cmg       = (searchParams.get('cmg') || '').split(',').filter(Boolean)

    const params: any[] = []
    const push = (v: any) => { params.push(v); return params.length }

    // Sales conditions (filtered by order_date + CMG)
    const salesConds: string[] = []
    if (startDate) salesConds.push(`order_date >= $${push(startDate)}::date`)
    if (endDate)   salesConds.push(`order_date <= $${push(endDate)}::date`)
    if (cmg.length > 0) salesConds.push(`primary_cmg = ANY($${push(cmg)})`)
    const salesWhere = salesConds.length > 0 ? `WHERE ${salesConds.join(' AND ')}` : ''

    // Calls conditions (filtered by first_connected_date, no CMG — calls are not CMG-specific)
    const callConds: string[] = []
    if (startDate) callConds.push(`first_connected_date >= $${push(startDate)}::date`)
    if (endDate)   callConds.push(`first_connected_date <= $${push(endDate)}::date`)
    const callsWhere = callConds.length > 0 ? `WHERE ${callConds.join(' AND ')}` : ''

    const rows = await query<{
      agent: string
      sales_total: string
      order_total: string
      call_total: string
      converted_customers: string
    }>(`
      WITH sales_agg AS (
        SELECT
          COALESCE(agent, '—') AS agent,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE ${CONV}), 0) AS sales_total,
          COUNT(DISTINCT order_number) FILTER (WHERE ${CONV})    AS order_total,
          COUNT(DISTINCT mmid) FILTER (WHERE ${CONV})            AS converted_customers
        FROM sales_hoc_orders
        ${salesWhere}
        GROUP BY agent
        HAVING COALESCE(SUM(sales_in_vat) FILTER (WHERE ${CONV}), 0) > 0
      ),
      calls_agg AS (
        SELECT
          agent,
          COUNT(DISTINCT mmid) AS call_total
        FROM telesales_calls
        ${callsWhere}
        GROUP BY agent
      )
      SELECT
        s.agent,
        s.sales_total::text,
        s.order_total::text,
        COALESCE(c.call_total, 0)::text AS call_total,
        s.converted_customers::text
      FROM sales_agg s
      LEFT JOIN calls_agg c ON c.agent = s.agent
      ORDER BY s.sales_total DESC
    `, params)

    const data = rows.map(r => {
      const call_total          = Number(r.call_total)
      const converted_customers = Number(r.converted_customers)
      return {
        agent:               r.agent,
        sales_total:         Number(r.sales_total),
        order_total:         Number(r.order_total),
        call_total,
        converted_customers,
        conversion_rate: call_total > 0 ? converted_customers / call_total : 0,
      }
    })

    const res = NextResponse.json({ ok: true, data })
    setCacheHeader(res, 'LONG')
    return res
  })
}
