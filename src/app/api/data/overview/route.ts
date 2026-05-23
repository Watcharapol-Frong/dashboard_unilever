import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function weeksAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n * 7)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(req.url)
    const mode      = (searchParams.get('mode') ?? 'weekly') as 'weekly' | 'monthly'
    const fromParam = searchParams.get('from')
    const toParam   = searchParams.get('to')

    // ── Monthly mode — query mart_performance ───────────────────────────────
    if (mode === 'monthly') {
      const args: string[] = []
      let whereClause = ''
      if (fromParam) {
        args.push(fromParam, toParam ?? todayStr())
        whereClause = `WHERE month >= $1::date AND month <= $2::date`
      }

      const rows = await query<{
        month: string; month_label: string; dynamic_cmg: string
        total_calls: number; reached: number; ordered: number
        new_customers: number; retention: number; hoc_orders: number
        hoc_sales: string; sales_target: string; achievement_ratio: string
        total_incentive: string; total_agent_cost: string; total_expense: string; roi: string
      }>(`
        SELECT
          month::text,
          TO_CHAR(month, 'FMMonth') AS month_label,
          dynamic_cmg, total_calls, reached, ordered, new_customers, retention, hoc_orders,
          hoc_sales, sales_target, achievement_ratio,
          total_incentive, total_agent_cost, total_expense, roi
        FROM mart_performance
        ${whereClause}
        ORDER BY month, dynamic_cmg
      `, args)

      const data = rows.map(r => ({
        period_key:       r.month,
        period_label:     r.month_label,
        dynamic_cmg:      r.dynamic_cmg,
        total_calls:      Number(r.total_calls ?? 0),
        reached:          Number(r.reached ?? 0),
        ordered:          Number(r.ordered ?? 0),
        new_customers:    Number(r.new_customers ?? 0),
        retention:        Number(r.retention ?? 0),
        hoc_orders:       Number(r.hoc_orders ?? 0),
        hoc_sales:        Number(r.hoc_sales ?? 0),
        sales_target:     Number(r.sales_target ?? 0),
        achievement_ratio:Number(r.achievement_ratio ?? 0),
        total_incentive:  Number(r.total_incentive ?? 0),
        total_agent_cost: Number(r.total_agent_cost ?? 0),
        total_expense:    Number(r.total_expense ?? 0),
        roi:              Number(r.roi ?? 0),
      }))

      const res = NextResponse.json({ ok: true, data, mode: 'monthly' })
      res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
      return res
    }

    // ── Weekly mode — query mart_telesales_orders + telesales_calls ─────────
    const fromDate = fromParam ?? weeksAgoStr(8)
    const toDate   = toParam   ?? todayStr()

    const rows = await query<{
      period_key: string; period_label: string; dynamic_cmg: string
      total_calls: string; reached: string; ordered: string
      new_customers: string; retention: string; hoc_orders: string; hoc_sales: string
    }>(`
      WITH week_orders AS (
        SELECT
          DATE_TRUNC('week', order_date)::date            AS period_key,
          MIN(week_label)                                  AS period_label,
          dynamic_cmg,
          COUNT(DISTINCT mmid)
            FILTER (WHERE customer_type IN ('new_customer','retention'))          AS ordered,
          COUNT(DISTINCT mmid)
            FILTER (WHERE customer_type = 'new_customer')                         AS new_customers,
          COUNT(DISTINCT mmid)
            FILTER (WHERE customer_type = 'retention')                            AS retention,
          COUNT(DISTINCT order_number)
            FILTER (WHERE customer_type IN ('new_customer','retention'))          AS hoc_orders,
          COALESCE(
            SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')), 0
          )                                                                        AS hoc_sales
        FROM mart_telesales_orders
        WHERE order_date >= $1 AND order_date <= $2
        GROUP BY DATE_TRUNC('week', order_date)::date, dynamic_cmg
      ),
      week_calls AS (
        SELECT
          DATE_TRUNC('week', first_connected_date)::date AS period_key,
          COUNT(DISTINCT mmid)                            AS total_calls,
          COUNT(DISTINCT mmid) FILTER (
            WHERE call_status NOT LIKE 'ไม่รับสาย%'
              AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
          )                                               AS reached
        FROM telesales_calls
        WHERE first_connected_date IS NOT NULL
          AND first_connected_date >= $1 AND first_connected_date <= $2
        GROUP BY 1
      )
      SELECT
        wo.period_key::text,
        COALESCE(wo.period_label, wo.period_key::text) AS period_label,
        wo.dynamic_cmg,
        COALESCE(wc.total_calls, 0) AS total_calls,
        COALESCE(wc.reached,     0) AS reached,
        wo.ordered, wo.new_customers, wo.retention, wo.hoc_orders, wo.hoc_sales
      FROM week_orders wo
      LEFT JOIN week_calls wc ON wc.period_key = wo.period_key
      ORDER BY wo.period_key, wo.dynamic_cmg
    `, [fromDate, toDate])

    const data = rows.map(r => ({
      period_key:       r.period_key,
      period_label:     r.period_label,
      dynamic_cmg:      r.dynamic_cmg,
      total_calls:      Number(r.total_calls ?? 0),
      reached:          Number(r.reached ?? 0),
      ordered:          Number(r.ordered ?? 0),
      new_customers:    Number(r.new_customers ?? 0),
      retention:        Number(r.retention ?? 0),
      hoc_orders:       Number(r.hoc_orders ?? 0),
      hoc_sales:        Number(r.hoc_sales ?? 0),
      sales_target:     0,
      achievement_ratio:0,
      total_incentive:  0,
      total_agent_cost: 0,
      total_expense:    0,
      roi:              0,
    }))

    const res = NextResponse.json({ ok: true, data, mode: 'weekly' })
    res.headers.set('Cache-Control', 'no-cache')
    return res
  })
}
