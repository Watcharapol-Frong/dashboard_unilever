import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0]



  const supabase = createServiceClient()
  const [onlineRes, offlineRes, targetRes, newCustRes] = await Promise.all([
    supabase.from('sales_online').select('order_id, order_date, customer_id, customer_name, product_sku, product_brand, qty, sales_amount').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false }),
    supabase.from('sales_offline').select('order_id, order_date, customer_id, customer_name, product_sku, product_brand, qty, sales_amount').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false }),
    supabase.from('targets').select('sales_target_thb').lte('period_start', to).gte('period_end', from).limit(1).maybeSingle(),
    supabase.rpc('count_new_customers', { p_from: from, p_to: to }),
  ])

  const online  = onlineRes.data ?? []
  const offline = offlineRes.data ?? []
  const total_sales_online  = online.reduce((s, r) => s + Number(r.sales_amount), 0)
  const total_sales_offline = offline.reduce((s, r) => s + Number(r.sales_amount), 0)
  const total_sales  = total_sales_online + total_sales_offline
  const dateMap = new Map<string, { date: string; online: number; offline: number }>()
  for (const r of online) {
    if (!dateMap.has(r.order_date)) dateMap.set(r.order_date, { date: r.order_date, online: 0, offline: 0 })
    dateMap.get(r.order_date)!.online += Number(r.sales_amount)
  }
  for (const r of offline) {
    if (!dateMap.has(r.order_date)) dateMap.set(r.order_date, { date: r.order_date, online: 0, offline: 0 })
    dateMap.get(r.order_date)!.offline += Number(r.sales_amount)
  }
  const by_date = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const all_orders = [...online.map(o => ({ ...o, channel: 'online' })), ...offline.map(o => ({ ...o, channel: 'offline' }))].sort((a, b) => b.order_date.localeCompare(a.order_date)).slice(0, 50)
  const total_orders = online.length + offline.length
  const target = targetRes.data?.sales_target_thb ?? 0

  return NextResponse.json({
    total_sales, total_sales_online, total_sales_offline,
    target, target_pct: target > 0 ? total_sales / target : 0,
    new_customers: newCustRes.data ?? 0,
    avg_order_value: total_orders > 0 ? total_sales / total_orders : 0,
    by_date, recent_orders: all_orders,
  })
}
