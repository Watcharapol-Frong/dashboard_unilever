import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'

const ALLOWED_GROUP_BY = ['month', 'week', 'day'] as const
type GroupBy = typeof ALLOWED_GROUP_BY[number]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const from = searchParams.get('from') ?? monthStart
  const to   = searchParams.get('to')   ?? today
  const groupBy: GroupBy = ALLOWED_GROUP_BY.includes(searchParams.get('groupBy') as GroupBy)
    ? (searchParams.get('groupBy') as GroupBy)
    : 'month'

  const periodExpr  = `DATE_TRUNC('${groupBy}', first_connected_date)::date`
  const chartFilter = groupBy === 'day' ? 'AND first_connected_date BETWEEN $1 AND $2' : ''
  const chartParams = groupBy === 'day' ? [from, to] : []

  const [callStatusRows, agentRows, byPeriodRows, leadCountRow, martSummaryRow, hocRows] = await Promise.all([
    // Call status breakdown from raw telesales
    query<{ call_status: string; total: string }>(
      `SELECT call_status, COUNT(*) AS total FROM telesales_calls
       WHERE first_connected_date BETWEEN $1 AND $2 GROUP BY call_status ORDER BY total DESC`,
      [from, to]
    ),
    // Agent performance with conversion rate
    query<{ agent: string; total_calls: string; reached: string; not_reached: string; converted_orders: string }>(
      `SELECT tc.agent, COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE tc.call_status = 'รับสาย') AS reached,
         COUNT(*) FILTER (WHERE tc.call_status != 'รับสาย') AS not_reached,
         COUNT(DISTINCT m.mmid) AS converted_orders
       FROM telesales_calls tc
       LEFT JOIN mart_telesales_orders m ON tc.mmid = m.mmid AND m.first_connected_date BETWEEN $1 AND $2
       WHERE tc.first_connected_date BETWEEN $1 AND $2 AND tc.agent IS NOT NULL
       GROUP BY tc.agent ORDER BY total_calls DESC`,
      [from, to]
    ),
    // Trend by period
    query<{ period: string; total_calls: string; reached: string }>(
      `SELECT ${periodExpr} AS period, COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE call_status = 'รับสาย') AS reached
       FROM telesales_calls WHERE first_connected_date IS NOT NULL ${chartFilter}
       GROUP BY period ORDER BY period`,
      chartParams
    ),
    // Total leads
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads`),
    // Mart: ordered attribution (14d window)
    queryOne<{
      ordered: string; new_customers: string; retention: string
    }>(
      `SELECT
         COUNT(DISTINCT mmid)                                                  AS ordered,
         COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')   AS new_customers,
         COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'retention')      AS retention
       FROM mart_telesales_orders
       WHERE first_connected_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    // Mart: HOC Unilever breakdown
    query<{ brands: string; orders: string; sales: string }>(
      `SELECT brands, COUNT(DISTINCT order_number) AS orders, COALESCE(SUM(sales_in_vat), 0) AS sales
       FROM mart_telesales_orders
       WHERE is_hoc_unilever = TRUE AND first_connected_date BETWEEN $1 AND $2
       GROUP BY brands ORDER BY sales DESC`,
      [from, to]
    ),
  ])

  const callStatusMap: Record<string, number> = {}
  for (const r of callStatusRows) callStatusMap[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  const total_calls   = Object.values(callStatusMap).reduce((s, v) => s + v, 0)
  const reached       = callStatusMap['รับสาย'] ?? 0
  const not_reached   = total_calls - reached

  const daysElapsed = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1)

  const by_agent = agentRows.map(r => ({
    agent:           r.agent,
    total_calls:     Number(r.total_calls),
    reached:         Number(r.reached),
    not_reached:     Number(r.not_reached),
    reach_rate:      Number(r.total_calls) > 0 ? Number(r.reached) / Number(r.total_calls) : 0,
    conversion_rate: Number(r.total_calls) > 0 ? Number(r.converted_orders) / Number(r.total_calls) : 0,
    calls_per_day:   Number(r.total_calls) / daysElapsed,
  }))

  const by_period = byPeriodRows.map(r => ({
    period: r.period, total_calls: Number(r.total_calls), reached: Number(r.reached),
  }))

  const lead_count     = Number(leadCountRow?.cnt ?? 0)
  const ordered_count  = Number(martSummaryRow?.ordered ?? 0)
  const new_customers  = Number(martSummaryRow?.new_customers ?? 0)
  const retention      = Number(martSummaryRow?.retention ?? 0)
  const not_ordered    = reached - ordered_count > 0 ? reached - ordered_count : 0

  const hoc_breakdown = hocRows.map(r => ({
    brands: r.brands, orders: Number(r.orders), sales: Number(r.sales),
  }))
  const hoc_total_sales = hoc_breakdown.reduce((s, r) => s + r.sales, 0)

  // Sankey — uses actual mart data for ordered attribution
  const sankeyNodes = [
    lead_count   > 0 ? { id: 'Lead List' }     : null,
    total_calls  > 0 ? { id: 'Called' }         : null,
    reached      > 0 ? { id: 'Reached' }        : null,
    not_reached  > 0 ? { id: 'Not Reached' }    : null,
    ordered_count > 0 ? { id: 'Ordered (14d)' } : null,
    not_ordered  > 0 ? { id: 'Not Ordered' }    : null,
    new_customers > 0 ? { id: 'New Customer' }  : null,
    retention    > 0 ? { id: 'Retention' }      : null,
  ].filter(Boolean) as { id: string }[]

  const sankeyLinks = [
    lead_count > 0 && total_calls > 0
      ? { source: 'Lead List',       target: 'Called',        value: Math.min(lead_count, total_calls) } : null,
    reached     > 0
      ? { source: 'Called',          target: 'Reached',       value: reached }      : null,
    not_reached > 0
      ? { source: 'Called',          target: 'Not Reached',   value: not_reached }  : null,
    ordered_count > 0
      ? { source: 'Reached',         target: 'Ordered (14d)', value: ordered_count } : null,
    not_ordered > 0
      ? { source: 'Reached',         target: 'Not Ordered',   value: not_ordered }  : null,
    new_customers > 0
      ? { source: 'Ordered (14d)',   target: 'New Customer',  value: new_customers } : null,
    retention > 0
      ? { source: 'Ordered (14d)',   target: 'Retention',     value: retention }    : null,
  ].filter(Boolean)

  return NextResponse.json({
    summary: { total_calls, reached, not_reached, call_status_breakdown: callStatusMap },
    attribution: { ordered_count, new_customers, retention },
    hoc: { breakdown: hoc_breakdown, total_sales: hoc_total_sales },
    by_agent,
    by_period,
    sankey: { nodes: sankeyNodes, links: sankeyLinks },
    callStatusMap,
  })
}
