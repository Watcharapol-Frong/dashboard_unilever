import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { CONV } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const cmg   = (searchParams.get('cmg') || '').split(',').filter(Boolean)
    const view  = searchParams.get('view') || 'monthly'
    const cmgParams: unknown[] = []
    const cmgSql = cmg.length > 0
      ? (cmgParams.push(cmg), `AND dynamic_cmg = ANY($${cmgParams.length})`)
      : ''

    // ── Weekly view — uses full date range from page filters ─────────────────
    if (view === 'weekly') {
      const start = searchParams.get('start') || ''
      const end   = searchParams.get('end')   || ''
      if (!start || !end) {
        return NextResponse.json({ ok: true, data: [] })
      }

      cmgParams.push(start, end)
      const si = cmgParams.length - 1
      const ei = cmgParams.length

      // Target is monthly — prorate each month's target across overlapping days of each week
      const rows = await query<{
        period: string; online_sales: string; offline_sales: string; target: string
      }>(`
        WITH week_sales AS (
          SELECT
            DATE_TRUNC('week', order_date)::date AS week_start,
            COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'online'  AND ${CONV}), 0) AS online_sales,
            COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'offline' AND ${CONV}), 0) AS offline_sales
          FROM sales_hoc_orders
          WHERE order_date >= $${si}::date
            AND order_date <= $${ei}::date
            ${cmgSql}
          GROUP BY 1
        ),
        month_targets AS (
          SELECT
            month,
            ((month + INTERVAL '1 month')::date - month) AS days_in_month,
            COALESCE(SUM(sales_target), 0) AS sales_target
          FROM mart_performance_cmg
          WHERE month >= DATE_TRUNC('month', $${si}::date)::date
            AND month <= DATE_TRUNC('month', $${ei}::date)::date
            ${cmgSql}
          GROUP BY month
        )
        SELECT
          ws.week_start::text AS period,
          ws.online_sales::text,
          ws.offline_sales::text,
          ROUND(COALESCE(SUM(
            mt.sales_target::numeric
            * GREATEST(0,
                LEAST(ws.week_start + 6, (mt.month + INTERVAL '1 month')::date - 1, $${ei}::date)
                - GREATEST(ws.week_start, mt.month, $${si}::date)
                + 1
              )::numeric
            / mt.days_in_month
          ), 0))::text AS target
        FROM week_sales ws
        LEFT JOIN month_targets mt
          ON mt.month <= ws.week_start + 6
         AND (mt.month + INTERVAL '1 month')::date > ws.week_start
        GROUP BY ws.week_start, ws.online_sales, ws.offline_sales
        ORDER BY ws.week_start
      `, cmgParams)

      const res = NextResponse.json({
        ok: true,
        data: rows.map(r => ({
          period:        r.period,
          online_sales:  Number(r.online_sales),
          offline_sales: Number(r.offline_sales),
          target:        Number(r.target),
        })),
      })
      setCacheHeader(res, 'MEDIUM')
      return res
    }

    // ── Monthly view ─────────────────────────────────────────────────────────
    const [salesRows, targetRows, roiRows] = await Promise.all([
      query<{ period: string; online_sales: string; offline_sales: string }>(`
        SELECT
          month::text AS period,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'online'  AND ${CONV}), 0)::text AS online_sales,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE channel = 'offline' AND ${CONV}), 0)::text AS offline_sales
        FROM sales_hoc_orders
        WHERE 1=1 ${cmgSql}
        GROUP BY month
        ORDER BY month
      `, cmgParams),

      query<{ period: string; target: string }>(`
        SELECT
          month::text AS period,
          COALESCE(SUM(sales_target), 0)::text AS target
        FROM mart_performance_cmg
        WHERE 1=1 ${cmgSql}
        GROUP BY month
        ORDER BY month
      `, cmgParams),

      // ROI is programme-level — not split by CMG
      query<{ period: string; roi: string }>(`
        SELECT month::text AS period, COALESCE(roi, 0)::text AS roi
        FROM mart_performance_month
        ORDER BY month
      `),
    ])

    const targetByMonth = new Map(targetRows.map(r => [r.period, Number(r.target)]))
    const roiByMonth    = new Map(roiRows.map(r => [r.period, Number(r.roi)]))

    const res = NextResponse.json({
      ok: true,
      data: salesRows.map(r => ({
        period:        r.period,
        online_sales:  Number(r.online_sales),
        offline_sales: Number(r.offline_sales),
        target:        targetByMonth.get(r.period) ?? 0,
        roi:           roiByMonth.get(r.period)    ?? 0,
      })),
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
