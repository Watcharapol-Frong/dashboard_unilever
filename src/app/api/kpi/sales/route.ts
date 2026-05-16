import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const from = searchParams.get('from') ?? monthStart
  const to   = searchParams.get('to')   ?? today

  const [totalsRows, byDateRows, targetRow, newCustRow, recentOnline, recentOffline] = await Promise.all([
    query<{ channel: string; total_sales: string; order_count: string }>(
      `SELECT 'Online' AS channel, COALESCE(SUM(sales_in_vat),0) AS total_sales, COUNT(DISTINCT order_number) AS order_count FROM online_sales WHERE order_date BETWEEN $1 AND $2
       UNION ALL SELECT 'Offline', COALESCE(SUM(sales_in_vat),0), COUNT(DISTINCT order_number) FROM offline_sales WHERE order_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    query<{ order_date: string; channel: string; total_sales: string }>(
      `SELECT order_date::text, 'Online' AS channel, COALESCE(SUM(sales_in_vat),0) AS total_sales FROM online_sales WHERE order_date BETWEEN $1 AND $2 GROUP BY order_date
       UNION ALL SELECT order_date::text, 'Offline', COALESCE(SUM(sales_in_vat),0) FROM offline_sales WHERE order_date BETWEEN $1 AND $2 GROUP BY order_date
       ORDER BY order_date`,
      [from, to]
    ),
    queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(sales_target),0) AS total FROM targets WHERE month BETWEEN date_trunc('month',$1::date)::date AND date_trunc('month',$2::date)::date`,
      [from, to]
    ),
    queryOne<{ cnt: string }>(
      `WITH a AS (SELECT mmid, order_date FROM online_sales WHERE mmid IS NOT NULL UNION ALL SELECT mmid, order_date FROM offline_sales WHERE mmid IS NOT NULL), f AS (SELECT mmid, MIN(order_date) AS first_date FROM a GROUP BY mmid) SELECT COUNT(*) AS cnt FROM f WHERE first_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    query<{ order_number: string; order_date: string; mmid: string; prod_num: string; sales_qty: number; sales_in_vat: number; dynamic_cmg: string }>(
      `SELECT order_number, order_date::text AS order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg FROM online_sales WHERE order_date BETWEEN $1 AND $2 ORDER BY order_date DESC LIMIT 25`,
      [from, to]
    ),
    query<{ order_number: string; order_date: string; mmid: string; prod_num: string; sales_qty: number; sales_in_vat: number; dynamic_cmg: string }>(
      `SELECT order_number, order_date::text AS order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg FROM offline_sales WHERE order_date BETWEEN $1 AND $2 ORDER BY order_date DESC LIMIT 25`,
      [from, to]
    ),
  ])

  const onlineRow  = totalsRows.find(r => r.channel === 'Online')
  const offlineRow = totalsRows.find(r => r.channel === 'Offline')
  const total_sales_online  = Number(onlineRow?.total_sales  ?? 0)
  const total_sales_offline = Number(offlineRow?.total_sales ?? 0)
  const total_sales   = total_sales_online + total_sales_offline
  const total_orders  = Number(onlineRow?.order_count ?? 0) + Number(offlineRow?.order_count ?? 0)

  const dateMap = new Map<string, { date: string; online: number; offline: number }>()
  for (const r of byDateRows) {
    if (!dateMap.has(r.order_date)) dateMap.set(r.order_date, { date: r.order_date, online: 0, offline: 0 })
    const e = dateMap.get(r.order_date)!
    if (r.channel === 'Online')  e.online  += Number(r.total_sales)
    if (r.channel === 'Offline') e.offline += Number(r.total_sales)
  }
  const by_date = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  const recent_orders = [
    ...recentOnline.map(r => ({ ...r, channel: 'Online' })),
    ...recentOffline.map(r => ({ ...r, channel: 'Offline' })),
  ].sort((a, b) => b.order_date.localeCompare(a.order_date)).slice(0, 50)

  const target     = Number(targetRow?.total ?? 0)
  const target_pct = target > 0 ? total_sales / target : 0

  return NextResponse.json({
    total_sales, total_sales_online, total_sales_offline, total_orders,
    target, target_pct,
    avg_order_value: total_orders > 0 ? total_sales / total_orders : 0,
    new_customers: Number(newCustRow?.cnt ?? 0),
    by_date, recent_orders,
  })
}
