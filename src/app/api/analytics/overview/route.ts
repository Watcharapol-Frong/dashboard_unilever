import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const from      = searchParams.get('from')      ?? monthStart
  const to        = searchParams.get('to')        ?? today
  const prev_from = searchParams.get('prev_from') ?? ''
  const prev_to   = searchParams.get('prev_to')   ?? ''
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)

  const [salesRows, callStatusRows, callCountRow, targetRow, martRow, newCustRow] = await Promise.all([
    query<{ channel: string; total_sales: string; order_count: string }>(
      `SELECT 'Online' AS channel, COALESCE(SUM(sales_in_vat),0) AS total_sales, COUNT(DISTINCT order_number) AS order_count FROM online_sales WHERE order_date BETWEEN $1 AND $2
       UNION ALL
       SELECT 'Offline', COALESCE(SUM(sales_in_vat),0), COUNT(DISTINCT order_number) FROM offline_sales WHERE order_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    query<{ call_status: string; total: string }>(
      `SELECT call_status, COUNT(*) AS total FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2 GROUP BY call_status ORDER BY total DESC`,
      [from, to]
    ),
    queryOne<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(sales_target),0) AS total FROM targets WHERE month BETWEEN date_trunc('month',$1::date)::date AND date_trunc('month',$2::date)::date`,
      [from, to]
    ),
    queryOne<{ attributed_sales: string; new_customers_via_call: string }>(
      `SELECT
         COALESCE(SUM(sales_in_vat), 0) AS attributed_sales,
         COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer') AS new_customers_via_call
       FROM mart_table_main
       WHERE first_connected_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    queryOne<{ cnt: string }>(
      `WITH all_orders AS (
         SELECT mmid, order_date FROM online_sales WHERE mmid IS NOT NULL
         UNION ALL
         SELECT mmid, order_date FROM offline_sales WHERE mmid IS NOT NULL
       ), first_orders AS (
         SELECT mmid, MIN(order_date) AS first_date FROM all_orders GROUP BY mmid
       )
       SELECT COUNT(*) AS cnt FROM first_orders WHERE first_date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ])

  const onlineRow  = salesRows.find(r => r.channel === 'Online')
  const offlineRow = salesRows.find(r => r.channel === 'Offline')
  const total_sales_online  = Number(onlineRow?.total_sales  ?? 0)
  const total_sales_offline = Number(offlineRow?.total_sales ?? 0)
  const total_sales  = total_sales_online + total_sales_offline
  const order_count  = Number(onlineRow?.order_count ?? 0) + Number(offlineRow?.order_count ?? 0)
  const aov          = order_count > 0 ? total_sales / order_count : 0
  const total_calls  = Number(callCountRow?.cnt ?? 0)
  const callStatusMap: Record<string, number> = {}
  for (const r of callStatusRows) callStatusMap[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  const reached         = callStatusMap['รับสาย'] ?? 0
  const connection_rate = total_calls > 0 ? reached / total_calls : 0
  const sales_target              = Number(targetRow?.total ?? 0)
  const target_pct                = sales_target > 0 ? total_sales / sales_target : 0
  const new_customers             = Number(newCustRow?.cnt ?? 0)
  const telesales_attributed_sales = Number(martRow?.attributed_sales ?? 0)
  const new_customers_via_call    = Number(martRow?.new_customers_via_call ?? 0)

  let prev_total_sales = 0, prev_total_calls = 0, prev_new_customers = 0, prev_connection_rate = 0
  if (prev_from && prev_to) {
    const [pSales, pCallCount, pCallStatus, pNewCust] = await Promise.all([
      query<{ channel: string; total_sales: string }>(
        `SELECT 'Online' AS channel, COALESCE(SUM(sales_in_vat),0) AS total_sales FROM online_sales WHERE order_date BETWEEN $1 AND $2
         UNION ALL SELECT 'Offline', COALESCE(SUM(sales_in_vat),0) FROM offline_sales WHERE order_date BETWEEN $1 AND $2`,
        [prev_from, prev_to]
      ),
      queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2`, [prev_from, prev_to]),
      query<{ call_status: string; total: string }>(`SELECT call_status, COUNT(*) AS total FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2 GROUP BY call_status`, [prev_from, prev_to]),
      queryOne<{ cnt: string }>(
        `WITH a AS (SELECT mmid, order_date FROM online_sales WHERE mmid IS NOT NULL UNION ALL SELECT mmid, order_date FROM offline_sales WHERE mmid IS NOT NULL), f AS (SELECT mmid, MIN(order_date) AS first_date FROM a GROUP BY mmid) SELECT COUNT(*) AS cnt FROM f WHERE first_date BETWEEN $1 AND $2`,
        [prev_from, prev_to]
      ),
    ])
    prev_total_sales   = pSales.reduce((s,r) => s + Number(r.total_sales), 0)
    prev_total_calls   = Number(pCallCount?.cnt ?? 0)
    prev_new_customers = Number(pNewCust?.cnt ?? 0)
    const pReached = pCallStatus.find(r => r.call_status === 'รับสาย')
    prev_connection_rate = prev_total_calls > 0 ? Number(pReached?.total ?? 0) / prev_total_calls : 0
  }

  return NextResponse.json({
    new_customers, new_customers_per_day: new_customers / days,
    total_sales, total_sales_online, total_sales_offline, order_count, aov,
    sales_target, target_pct,
    total_calls, calls_per_day: total_calls / days, connection_rate,
    contacted: reached, not_reached: total_calls - reached,
    telesales_attributed_sales, new_customers_via_call,
    prev_new_customers, prev_total_sales, prev_total_calls, prev_connection_rate,
    callStatusMap,
  })
}
