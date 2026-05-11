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
  const prev_from = searchParams.get('prev_from') ?? ''
  const prev_to   = searchParams.get('prev_to')   ?? ''

  const supabase = createServiceClient()
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)

  // ── Parallel queries for current period ──────────────────────
  const [salesRes, callStatusRes, callCountRes, targetRes, newCustRes] = await Promise.all([
    // Sales totals by channel (RPC — bypasses 1000-row cap)
    supabase.rpc('get_sales_totals', { p_from: from, p_to: to }),

    // Call status breakdown for the period
    supabase.rpc('get_call_status_counts_range', { p_from: from, p_to: to }),

    // Total call count (head:true = no row data, just count)
    supabase
      .from('telesales_calls')
      .select('*', { count: 'exact', head: true })
      .gte('first_connected_date', from)
      .lte('first_connected_date', to),

    // Sales target: sum all dynamic_cmg targets in range
    supabase.rpc('get_sales_target', { p_from: from, p_to: to }),

    // New customers (mmid first order in period)
    supabase.rpc('get_new_mmid_count', { p_from: from, p_to: to }),
  ])

  // ── Parse sales ───────────────────────────────────────────────
  const salesRows = salesRes.data ?? []
  const onlineRow  = salesRows.find((r: { channel: string }) => r.channel === 'Online')
  const offlineRow = salesRows.find((r: { channel: string }) => r.channel === 'Offline')
  const total_sales_online  = Number(onlineRow?.total_sales  ?? 0)
  const total_sales_offline = Number(offlineRow?.total_sales ?? 0)
  const total_sales  = total_sales_online + total_sales_offline
  const order_count  = Number(onlineRow?.order_count ?? 0) + Number(offlineRow?.order_count ?? 0)
  const aov          = order_count > 0 ? total_sales / order_count : 0

  // ── Parse calls ───────────────────────────────────────────────
  const callStatusRows: { call_status: string; total: number }[] = callStatusRes.data ?? []
  const total_calls = callCountRes.count ?? 0
  const callStatusMap: Record<string, number> = {}
  for (const r of callStatusRows) {
    callStatusMap[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  }
  const reached    = callStatusMap['รับสาย'] ?? 0
  const not_reached = total_calls - reached
  const connection_rate = total_calls > 0 ? reached / total_calls : 0

  // ── Targets ───────────────────────────────────────────────────
  const sales_target = Number(targetRes.data ?? 0)
  const target_pct   = sales_target > 0 ? total_sales / sales_target : 0

  // ── New / returning ───────────────────────────────────────────
  const new_customers = Number(newCustRes.data ?? 0)

  // ── Previous period comparison ────────────────────────────────
  let prev_total_sales = 0
  let prev_total_calls = 0
  let prev_new_customers = 0
  let prev_connection_rate = 0

  if (prev_from && prev_to) {
    const [pSales, pCallCount, pCallStatus, pNewCust] = await Promise.all([
      supabase.rpc('get_sales_totals', { p_from: prev_from, p_to: prev_to }),
      supabase
        .from('telesales_calls')
        .select('*', { count: 'exact', head: true })
        .gte('first_connected_date', prev_from)
        .lte('first_connected_date', prev_to),
      supabase.rpc('get_call_status_counts_range', { p_from: prev_from, p_to: prev_to }),
      supabase.rpc('get_new_mmid_count', { p_from: prev_from, p_to: prev_to }),
    ])
    const pSalesRows = pSales.data ?? []
    const pOnline  = pSalesRows.find((r: { channel: string }) => r.channel === 'Online')
    const pOffline = pSalesRows.find((r: { channel: string }) => r.channel === 'Offline')
    prev_total_sales   = Number(pOnline?.total_sales ?? 0) + Number(pOffline?.total_sales ?? 0)
    prev_total_calls   = pCallCount.count ?? 0
    prev_new_customers = Number(pNewCust.data ?? 0)
    const pCallStatusRows: { call_status: string; total: number }[] = pCallStatus.data ?? []
    const pReached = pCallStatusRows.find(r => r.call_status === 'รับสาย')?.total ?? 0
    prev_connection_rate = prev_total_calls > 0 ? Number(pReached) / prev_total_calls : 0
  }

  return NextResponse.json({
    // customers
    new_customers,
    new_customers_per_day: new_customers / days,
    // sales
    total_sales,
    total_sales_online,
    total_sales_offline,
    order_count,
    aov,
    sales_target,
    target_pct,
    // calls
    total_calls,
    calls_per_day: total_calls / days,
    connection_rate,
    contacted: reached,
    not_reached,
    // comparison
    prev_new_customers,
    prev_total_sales,
    prev_total_calls,
    prev_connection_rate,
    // call status map for charts
    callStatusMap,
  })
}
