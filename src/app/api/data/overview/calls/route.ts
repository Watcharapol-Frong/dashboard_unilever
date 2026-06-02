import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const cmg       = (searchParams.get('cmg') || '').split(',').filter(Boolean)

    const params: any[] = []
    const conds: string[] = ['tc.first_connected_date IS NOT NULL']

    const push = (v: any) => { params.push(v); return params.length }

    if (startDate) conds.push(`tc.first_connected_date >= $${push(startDate)}::date`)
    if (endDate)   conds.push(`tc.first_connected_date <= $${push(endDate)}::date`)

    const convConds: string[] = [`customer_type IN ('new_customer', 'retention')`]
    if (cmg.length > 0) convConds.push(`dynamic_cmg = ANY($${push(cmg)})`)

    const where = `WHERE ${conds.join(' AND ')}`

    const [callsRow, convRow] = await Promise.all([
      queryOne<{ total_calls: string }>(`
        SELECT COUNT(DISTINCT tc.mmid)::text AS total_calls
        FROM telesales_calls tc
        ${where}
      `, params),
      queryOne<{ converted: string }>(`
        WITH converted_mmids AS (
          SELECT DISTINCT mmid FROM sales_hoc_orders
          WHERE ${convConds.join(' AND ')}
        )
        SELECT COUNT(DISTINCT tc.mmid)::text AS converted
        FROM telesales_calls tc
        JOIN converted_mmids cm ON cm.mmid = tc.mmid
        ${where}
      `, params),
    ])

    const res = NextResponse.json({
      ok: true,
      data: {
        total_calls: Number(callsRow?.total_calls ?? 0),
        converted:   Number(convRow?.converted    ?? 0),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
