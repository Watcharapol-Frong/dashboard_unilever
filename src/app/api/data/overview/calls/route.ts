import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { REACHED } from '@/lib/metrics'

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

    const row = await query<{ total_calls: string; connected: string }>(`
      SELECT
        COUNT(DISTINCT mmid)::text AS total_calls,
        COUNT(DISTINCT mmid) FILTER (
          WHERE ${REACHED}
        )::text AS connected
      FROM sales_hoc_orders
      ${where}
    `, params)

    const res = NextResponse.json({
      ok: true,
      data: {
        total_calls: Number(row[0]?.total_calls ?? 0),
        connected:   Number(row[0]?.connected   ?? 0),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
