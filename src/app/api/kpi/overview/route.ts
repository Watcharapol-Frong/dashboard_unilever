import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const from = searchParams.get('from') ?? monthStart
  const to = searchParams.get('to') ?? today
  const prev_from = searchParams.get('prev_from') ?? ''
  const prev_to = searchParams.get('prev_to') ?? ''

  const supabase = createClient()

  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)

  // Current period
  const [onlineRes, offlineRes, callsRes, targetRes, newCustRes, onlineCustRes, offlineCustRes] = await Promise.all([
    supabase.from('sales_online').select('sales_amount, order_id, customer_id').gte('order_date', from).lte('order_date', to),
    supabase.from('sales_offline').select('sales_amount, order_id, customer_id').gte('order_date', from).lte('order_date', to),
    supabase.from('telesales_calls').select('call_status').gte('call_date', from).lte('call_date', to),
    supabase.from('targets').select('sales_target_thb').lte('period_start', to).gte('period_end', from).limit(1).maybeSingle(),
    supabase.rpc('count_new_customers', { p_from: from, p_to: to }),
    supabase.from('sales_online').select('customer_id').gte('order_date', from).lte('order_date', to),
    supabase.from('sales_offline').select('customer_id').gte('order_date', from).lte('order_date', to),
  ])

  // Current period metrics
  const total_sales_online = (onlineRes.data ?? []).reduce((s, r) => s + Number(r.sales_amount), 0)
  const total_sales_offline = (offlineRes.data ?? []).reduce((s, r) => s + Number(r.sales_amount), 0)
  const total_sales = total_sales_online + total_sales_offline
  const order_count = (onlineRes.data?.length ?? 0) + (offlineRes.data?.length ?? 0)
  const aov = order_count > 0 ? total_sales / order_count : 0

  const calls = callsRes.data ?? []
  const total_calls = calls.length
  // contacted = any status that means the call reached a person
  const contacted = calls.filter(c => ['Contacted', 'Interested', 'Not Interested', 'Ordered'].includes(c.call_status)).length
  const interested = calls.filter(c => ['Interested', 'Ordered'].includes(c.call_status)).length
  const ordered = calls.filter(c => c.call_status === 'Ordered').length

  const allCustIds = new Set([
    ...(onlineCustRes.data ?? []).map(r => r.customer_id),
    ...(offlineCustRes.data ?? []).map(r => r.customer_id),
  ])
  const total_customers = allCustIds.size
  const new_customers = newCustRes.data ?? 0
  const returning_customers = Math.max(0, total_customers - new_customers)
  const retention_rate = total_customers > 0 ? returning_customers / total_customers : 0

  const sales_target = targetRes.data?.sales_target_thb ?? 0

  // Previous period
  let prev_new_customers = 0, prev_total_sales = 0, prev_total_calls = 0
  let prev_contacted = 0, prev_interested = 0, prev_ordered = 0

  if (prev_from && prev_to) {
    const [pOnline, pOffline, pCalls, pNewCust] = await Promise.all([
      supabase.from('sales_online').select('sales_amount').gte('order_date', prev_from).lte('order_date', prev_to),
      supabase.from('sales_offline').select('sales_amount').gte('order_date', prev_from).lte('order_date', prev_to),
      supabase.from('telesales_calls').select('call_status').gte('call_date', prev_from).lte('call_date', prev_to),
      supabase.rpc('count_new_customers', { p_from: prev_from, p_to: prev_to }),
    ])
    prev_total_sales = [...(pOnline.data ?? []), ...(pOffline.data ?? [])].reduce((s, r) => s + Number(r.sales_amount), 0)
    prev_total_calls = (pCalls.data ?? []).length
    prev_contacted = (pCalls.data ?? []).filter((c: { call_status: string }) =>
      ['Contacted', 'Interested', 'Not Interested', 'Ordered'].includes(c.call_status)).length
    prev_interested = (pCalls.data ?? []).filter((c: { call_status: string }) =>
      ['Interested', 'Ordered'].includes(c.call_status)).length
    prev_ordered = (pCalls.data ?? []).filter((c: { call_status: string }) =>
      c.call_status === 'Ordered').length
    prev_new_customers = typeof pNewCust.data === 'number' ? pNewCust.data : 0
  }

  const prev_conversion_rate = prev_contacted > 0 ? prev_ordered / prev_contacted : 0
  const prev_engaged_rate = prev_contacted > 0 ? prev_interested / prev_contacted : 0

  return NextResponse.json({
    new_customers,
    new_customers_per_day: new_customers / days,
    returning_customers,
    retention_rate,
    total_customers,
    total_sales,
    total_sales_online,
    total_sales_offline,
    order_count,
    aov,
    sales_target,
    target_pct: sales_target > 0 ? total_sales / sales_target : 0,
    total_calls,
    calls_per_day: total_calls / days,
    connection_rate: total_calls > 0 ? contacted / total_calls : 0,
    contacted,
    conversion_count: ordered,
    conversion_rate: contacted > 0 ? ordered / contacted : 0,
    engaged: interested,
    engaged_rate: contacted > 0 ? interested / contacted : 0,
    // comparison
    prev_new_customers,
    prev_total_sales,
    prev_total_calls,
    prev_conversion_rate,
    prev_engaged_rate,
  })
}
