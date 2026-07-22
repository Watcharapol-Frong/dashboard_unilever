import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'
import { CONV, reachedCond } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

// ── Main Dashboard summary ────────────────────────────────────────────────────
// Two independent monthly series — they live on different time dimensions and
// must NOT be merged:
//   • sales[]      keyed by ORDER month  (sales_hoc_orders.month)  — CMG-filterable
//   • telesales[]  keyed by CALL  month  (first_connected_date)    — programme-wide
// ROI is programme-level (month grain, costs are not split by CMG).
export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const cmg = (searchParams.get('cmg') || '').split(',').filter(Boolean)

    const salesParams: any[] = []
    let cmgWhere = ''
    if (cmg.length > 0) {
      salesParams.push(cmg)
      cmgWhere = `WHERE dynamic_cmg = ANY($1)`
    }

    const [salesRows, roiRows, teleRows, cmgOpts] = await Promise.all([
      // Sales by order month (CMG-filterable)
      query<{ month: string; hoc_sales: string; target: string; new_customers: string; retention: string }>(`
        SELECT
          month::text                          AS month,
          COALESCE(SUM(hoc_sales), 0)::text    AS hoc_sales,
          COALESCE(SUM(sales_target), 0)::text AS target,
          COALESCE(SUM(new_customers), 0)::text AS new_customers,
          COALESCE(SUM(retention), 0)::text    AS retention
        FROM mart_performance_cmg
        ${cmgWhere}
        GROUP BY month
        ORDER BY month
      `, salesParams),

      // ROI + expense by month (programme-level)
      query<{ month: string; roi: string; expense: string }>(`
        SELECT
          month::text                       AS month,
          COALESCE(roi, 0)::text            AS roi,
          COALESCE(total_expense, 0)::text  AS expense
        FROM mart_performance_month
        ORDER BY month
      `),

      // Telesales by call month — calls / reached / converted in one pass
      query<{ month: string; total_calls: string; reached: string; converted: string }>(`
        WITH conv AS (
          SELECT DISTINCT mmid FROM sales_hoc_orders WHERE ${CONV}
        )
        SELECT
          DATE_TRUNC('month', tc.first_connected_date)::date::text AS month,
          COUNT(DISTINCT tc.mmid)::text                                   AS total_calls,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE ${reachedCond('tc')})::text AS reached,
          COUNT(DISTINCT tc.mmid) FILTER (WHERE c.mmid IS NOT NULL)::text   AS converted
        FROM telesales_calls tc
        LEFT JOIN conv c ON c.mmid = tc.mmid
        WHERE tc.first_connected_date IS NOT NULL
        GROUP BY 1
        ORDER BY 1
      `),

      query<{ cmg: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg FROM mart_performance_cmg
        WHERE dynamic_cmg IS NOT NULL ORDER BY 1
      `),
    ])

    const roiByMonth = new Map(roiRows.map(r => [r.month, r]))

    const sales = salesRows.map(r => {
      const hoc_sales = Number(r.hoc_sales)
      const target    = Number(r.target)
      const newCust   = Number(r.new_customers)
      const retention = Number(r.retention)
      const roiRow    = roiByMonth.get(r.month)
      return {
        month:          r.month,
        hoc_sales,
        target,
        achievement:    target > 0 ? hoc_sales / target : 0,
        new_customers:  newCust,
        retention,
        buyers:         newCust + retention,
        roi:            roiRow ? Number(roiRow.roi) : 0,
        expense:        roiRow ? Number(roiRow.expense) : 0,
      }
    })

    const telesales = teleRows.map(r => {
      const total_calls = Number(r.total_calls)
      const reached     = Number(r.reached)
      const converted   = Number(r.converted)
      return {
        month:           r.month,
        total_calls,
        reached,
        converted,
        reach_rate:      total_calls > 0 ? reached / total_calls : 0,
        conversion_rate: reached > 0 ? converted / reached : 0,
      }
    })

    const res = NextResponse.json({
      ok: true,
      data: {
        sales,
        telesales,
        cmg_options: cmgOpts.map(o => o.cmg),
      },
    })
    setCacheHeader(res, 'LONG')
    return res
  })
}
