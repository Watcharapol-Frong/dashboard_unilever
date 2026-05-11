import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]
  const from = searchParams.get('from') ?? monthStart
  const to   = searchParams.get('to')   ?? today

  const supabase = createServiceClient()

  const [totalsRes, byDateRes, targetRes, newCustRes, recentOnlineRes, recentOfflineRes] = await Promise.all([
    // Totals by channel
    supabase.rpc('get_sales_totals', { p_from: from, p_to: to }),

    // Daily breakdown for chart
    supabase.rpc('get_sales_by_date', { p_from: from, p_to: to }),

    // Sales target
    supabase.rpc('get_sales_target', { p_from: from, p_to: to }),

    // New customers
    supabase.rpc('get_new_mmid_count', { p_from: from, p_to: to }),

    // Recent orders — online (last 25)
    supabase
      .from('online_sales')
      .select('order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg')
      .gte('order_date', from)
      .lte('order_date', to)
      .order('order_date', { ascending: false })
      .limit(25),

    // Recent orders — offline (last 25)
    supabase
      .from('offline_sales')
      .select('order_number, order_date, mmid, prod_num, sales_qty, sales_in_vat, dynamic_cmg')
      .gte('order_date', from)
      .lte('order_date', to)
      .order('order_date', { ascending: false })
      .limit(25),
  ])

  // ── Parse sales totals ────────────────────────────────────────
  const salesRows = totalsRes.data ?? []
  const onlineRow  = salesRows.find((r: { channel: string }) => r.channel === 'Online')
  const offlineRow = salesRows.find((r: { channel: string }) => r.channel === 'Offline')
  const total_sales_online  = Number(onlineRow?.total_sales  ?? 0)
  const total_sales_offline = Number(offlineRow?.total_sales ?? 0)
  const total_sales  = total_sales_online + total_sales_offline
  const total_orders = Number(onlineRow?.order_count ?? 0) + Number(offlineRow?.order_count ?? 0)

  // ── Parse daily chart data ────────────────────────────────────
  const rawByDate: { order_date: string; channel: string; total_sales: number }[] = byDateRes.data ?? []
  const dateMap = new Map<string, { date: string; online: number; offline: number }>()
  for (const r of rawByDate) {
    const d = r.order_date
    if (!dateMap.has(d)) dateMap.set(d, { date: d, online: 0, offline: 0 })
    const entry = dateMap.get(d)!
    if (r.channel === 'Online')  entry.online  += Number(r.total_sales)
    if (r.channel === 'Offline') entry.offline += Number(r.total_sales)
  }
  const by_date = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // ── Parse recent orders ───────────────────────────────────────
  const recent_online  = (recentOnlineRes.data  ?? []).map(r => ({ ...r, channel: 'Online'  }))
  const recent_offline = (recentOfflineRes.data ?? []).map(r => ({ ...r, channel: 'Offline' }))
  const recent_orders = [...recent_online, ...recent_offline]
    .sort((a, b) => b.order_date.localeCompare(a.order_date))
    .slice(0, 50)

  const target    = Number(targetRes.data ?? 0)
  const target_pct = target > 0 ? total_sales / target : 0

  return NextResponse.json({
    total_sales,
    total_sales_online,
    total_sales_offline,
    total_orders,
    target,
    target_pct,
    avg_order_value: total_orders > 0 ? total_sales / total_orders : 0,
    new_customers: Number(newCustRes.data ?? 0),
    by_date,
    recent_orders,
  })
}
