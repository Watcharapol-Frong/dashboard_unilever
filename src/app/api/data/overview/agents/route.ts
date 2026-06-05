import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const cmg       = (searchParams.get('cmg') || '').split(',').filter(Boolean)

    const params: any[] = []
    const conds: string[] = []

    const push = (v: any) => { params.push(v); return params.length }

    if (startDate) conds.push(`order_date >= $${push(startDate)}::date`)
    if (endDate)   conds.push(`order_date <= $${push(endDate)}::date`)
    if (cmg.length > 0) conds.push(`primary_cmg = ANY($${push(cmg)})`)

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''

    const rows = await query<{
      agent: string
      sales_total: string
      order_total: string
      call_total: string
      converted_customers: string
    }>(`
      SELECT
        COALESCE(agent, '—') AS agent,
        COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer', 'retention')), 0)::text AS sales_total,
        COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer', 'retention'))::text AS order_total,
        COUNT(DISTINCT mmid)::text AS call_total,
        COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer', 'retention'))::text AS converted_customers
      FROM sales_hoc_orders
      ${where}
      GROUP BY agent
      HAVING COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer', 'retention')), 0) > 0
      ORDER BY SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer', 'retention')) DESC NULLS LAST
    `, params)

    const data = rows.map(r => {
      const call_total         = Number(r.call_total)
      const converted_customers = Number(r.converted_customers)
      return {
        agent:             r.agent,
        sales_total:       Number(r.sales_total),
        order_total:       Number(r.order_total),
        call_total,
        converted_customers,
        conversion_rate:   call_total > 0 ? converted_customers / call_total : 0,
      }
    })

    const res = NextResponse.json({ ok: true, data })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
