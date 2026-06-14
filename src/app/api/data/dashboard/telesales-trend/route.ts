import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { CONV, reachedCond } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'monthly'

    const convCTE = `WITH conv AS (
      SELECT DISTINCT mmid FROM sales_hoc_orders WHERE ${CONV}
    )`

    if (view === 'weekly') {
      const start = searchParams.get('start') || ''
      const end   = searchParams.get('end')   || ''
      if (!start || !end) {
        return NextResponse.json({ ok: true, data: [] })
      }

      const rows = await query<{
        period: string; total_calls: string; reached: string; converted: string
      }>(`
        ${convCTE}
        SELECT
          DATE_TRUNC('week', tc.first_connected_date)::date::text AS period,
          COUNT(DISTINCT tc.mmid)::text                                          AS total_calls,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE ${reachedCond('tc')})::text     AS reached,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE c.mmid IS NOT NULL)::text       AS converted
        FROM telesales_calls tc
        LEFT JOIN conv c ON c.mmid = tc.mmid
        WHERE tc.first_connected_date IS NOT NULL
          AND tc.first_connected_date >= $1::date
          AND tc.first_connected_date <= $2::date
        GROUP BY 1
        ORDER BY 1
      `, [start, end])

      const res = NextResponse.json({
        ok: true,
        data: rows.map(r => ({
          period:      r.period,
          total_calls: Number(r.total_calls),
          reached:     Number(r.reached),
          converted:   Number(r.converted),
        })),
      })
      setCacheHeader(res, 'MEDIUM')
      return res
    }

    // Monthly — all time, filtered client-side
    const rows = await query<{
      period: string; total_calls: string; reached: string; converted: string
    }>(`
      ${convCTE}
      SELECT
        DATE_TRUNC('month', tc.first_connected_date)::date::text AS period,
        COUNT(DISTINCT tc.mmid)::text                                          AS total_calls,
        COUNT(DISTINCT tc.mmid) FILTER (WHERE ${reachedCond('tc')})::text     AS reached,
        COUNT(DISTINCT tc.mmid) FILTER (WHERE c.mmid IS NOT NULL)::text       AS converted
      FROM telesales_calls tc
      LEFT JOIN conv c ON c.mmid = tc.mmid
      WHERE tc.first_connected_date IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `)

    const res = NextResponse.json({
      ok: true,
      data: rows.map(r => ({
        period:      r.period,
        total_calls: Number(r.total_calls),
        reached:     Number(r.reached),
        converted:   Number(r.converted),
      })),
    })
    setCacheHeader(res, 'SHORT')
    return res
  })
}
