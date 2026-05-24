import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    // 1. Get KPI Totals
    const kpis = await queryOne<{
      total_sales: string
      total_sales_online: string
      total_sales_offline: string
      total_orders: string
    }>(`
      SELECT
        COALESCE(SUM(sales_in_vat), 0)::text AS total_sales,
        COALESCE(SUM(CASE WHEN channel = 'online' THEN sales_in_vat ELSE 0 END), 0)::text AS total_sales_online,
        COALESCE(SUM(CASE WHEN channel = 'offline' THEN sales_in_vat ELSE 0 END), 0)::text AS total_sales_offline,
        COUNT(DISTINCT order_number)::text AS total_orders
      FROM sales_hoc_all
    `)

    // 2. Get Target
    const targetRow = await queryOne<{ target: string }>(`
      SELECT COALESCE(SUM(sales_target), 0)::text AS target
      FROM targets
    `)

    // 3. Get New Customers Count (Distinct MMID in telesales orders that are new_customer)
    const newCustRow = await queryOne<{ new_customers: string }>(`
      SELECT COUNT(DISTINCT mmid)::text AS new_customers
      FROM mart_telesales_orders
      WHERE customer_type = 'new_customer'
    `)

    // 4. Get sales trend by month
    const periods = await query<{
      period: string
      online: string
      offline: string
    }>(`
      SELECT
        month::text AS period,
        COALESCE(SUM(CASE WHEN channel = 'online' THEN sales_in_vat ELSE 0 END), 0)::text AS online,
        COALESCE(SUM(CASE WHEN channel = 'offline' THEN sales_in_vat ELSE 0 END), 0)::text AS offline
      FROM sales_hoc_all
      GROUP BY month
      ORDER BY month
    `)

    // 5. Get recent orders (up to 100)
    const recentOrders = await query<{
      order_number: string
      order_date: string
      mmid: string | null
      prod_num: string | null
      sales_qty: string
      sales_in_vat: string
      dynamic_cmg: string | null
      channel: string
    }>(`
      SELECT
        order_number,
        order_date::text,
        mmid,
        prod_num,
        sales_qty::text,
        sales_in_vat::text,
        dynamic_cmg,
        CASE WHEN channel = 'online' THEN 'Online' ELSE 'Offline' END AS channel
      FROM sales_hoc_all
      ORDER BY order_date DESC, order_number DESC
      LIMIT 100
    `)

    const totalSales = Number(kpis?.total_sales ?? 0)
    const totalOrders = Number(kpis?.total_orders ?? 0)
    const target = Number(targetRow?.target ?? 0)

    const data = {
      total_sales: totalSales,
      total_sales_online: Number(kpis?.total_sales_online ?? 0),
      total_sales_offline: Number(kpis?.total_sales_offline ?? 0),
      total_orders: totalOrders,
      target: target,
      target_pct: target > 0 ? (totalSales / target) : 0,
      new_customers: Number(newCustRow?.new_customers ?? 0),
      avg_order_value: totalOrders > 0 ? (totalSales / totalOrders) : 0,
      by_period: periods.map(p => ({
        period: p.period,
        online: Number(p.online),
        offline: Number(p.offline),
      })),
      recent_orders: recentOrders.map(o => ({
        order_number: o.order_number,
        order_date: o.order_date,
        mmid: o.mmid,
        prod_num: o.prod_num,
        sales_qty: Number(o.sales_qty),
        sales_in_vat: Number(o.sales_in_vat),
        dynamic_cmg: o.dynamic_cmg,
        channel: o.channel,
      })),
    }

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
