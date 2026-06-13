import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { reachedCond } from '@/lib/metrics'

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

    let join = ''
    if (cmg.length > 0) {
      conds.push(`mc.primary_cmg = ANY($${push(cmg)})`)
      join = 'LEFT JOIN mmid_cmg_map mc ON mc.mmid = tc.mmid'
    }

    const where = `WHERE ${conds.join(' AND ')}`

    const rows = await query<{ total_calls: string; connected: string }>(`
      SELECT
        COUNT(DISTINCT tc.mmid)::text AS total_calls,
        COUNT(DISTINCT tc.mmid) FILTER (WHERE ${reachedCond('tc')})::text AS connected
      FROM telesales_calls tc
      ${join}
      ${where}
    `, params)

    const res = NextResponse.json({
      ok: true,
      data: {
        total_calls: Number(rows[0]?.total_calls ?? 0),
        connected:   Number(rows[0]?.connected   ?? 0),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
