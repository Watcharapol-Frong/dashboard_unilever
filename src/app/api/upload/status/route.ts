import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()

  // ── last_uploaded per table — source of truth is upload_batches ──────────
  const { data: batches } = await supabase
    .from('upload_batches')
    .select('table_name, uploaded_at')
    .in('status', ['success', 'partial'])
    .order('uploaded_at', { ascending: false })

  const lastUpload: Record<string, string> = {}
  for (const b of batches ?? []) {
    if (!lastUpload[b.table_name]) lastUpload[b.table_name] = b.uploaded_at
  }

  // ── Silver table queries ──────────────────────────────────────────────────
  // sales totals + counts via DB aggregate (avoids PostgREST 1000-row cap on JS sum)
  const [
    salesTotals,
    onlineDatesQ,
    offlineDatesQ,
    leads,
    products,
    telesales,
    targets,
    costs,
    incentives,
  ] = await Promise.all([
    supabase.rpc('get_sales_totals'),
    supabase.from('online_sales').select('order_date', { count: 'exact' }).order('order_date', { ascending: true }).limit(1),
    supabase.from('offline_sales').select('order_date', { count: 'exact' }).order('order_date', { ascending: true }).limit(1),
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('prod_num, brands', { count: 'exact' }).limit(100_000),
    supabase.from('telesales_calls').select('first_connected_date, agent', { count: 'exact' }).limit(100_000),
    supabase.from('targets').select('month, dynamic_cmg, sales_target', { count: 'exact' }).limit(10_000),
    supabase.from('costs').select('month', { count: 'exact' }).limit(10_000),
    supabase.from('incentives').select('tier', { count: 'exact' }).limit(1_000),
  ])

  // ── online_sales ──────────────────────────────────────────────
  const onlineAgg  = (salesTotals.data ?? []).find((r: { channel: string }) => r.channel === 'online')
  // earliest via ASC limit 1; latest via separate DESC query (done below)
  const onlineEarliest = onlineDatesQ.data?.[0]?.order_date ?? null
  const { data: onlineLatestQ } = await supabase
    .from('online_sales').select('order_date').order('order_date', { ascending: false }).limit(1)
  const onlineSalesStatus = {
    total_rows:    Number(onlineAgg?.total_rows ?? 0),
    total_sales:   Number(onlineAgg?.total_sales ?? 0),
    earliest_date: onlineEarliest,
    latest_date:   onlineLatestQ?.[0]?.order_date ?? null,
    last_uploaded: lastUpload['online_sales'] ?? null,
  }

  // ── offline_sales ─────────────────────────────────────────────
  const offlineAgg = (salesTotals.data ?? []).find((r: { channel: string }) => r.channel === 'offline')
  const offlineEarliest = offlineDatesQ.data?.[0]?.order_date ?? null
  const { data: offlineLatestQ } = await supabase
    .from('offline_sales').select('order_date').order('order_date', { ascending: false }).limit(1)
  const offlineSalesStatus = {
    total_rows:    Number(offlineAgg?.total_rows ?? 0),
    total_sales:   Number(offlineAgg?.total_sales ?? 0),
    earliest_date: offlineEarliest,
    latest_date:   offlineLatestQ?.[0]?.order_date ?? null,
    last_uploaded: lastUpload['offline_sales'] ?? null,
  }

  // ── leads ─────────────────────────────────────────────────────
  const leadsStatus = {
    total_rows:    leads.count ?? 0,
    last_uploaded: lastUpload['leads'] ?? null,
  }

  // ── products ──────────────────────────────────────────────────
  const prodData  = products.data ?? []
  const brandSet  = new Set(prodData.map(r => r.brands).filter(Boolean))
  const productsStatus = {
    total_rows:    products.count ?? prodData.length,
    total_brands:  brandSet.size,
    last_uploaded: lastUpload['products'] ?? null,
  }

  // ── telesales ─────────────────────────────────────────────────
  const teleData  = telesales.data ?? []
  const agentSet  = new Set(teleData.map(r => r.agent).filter(Boolean))
  const teleDates = teleData.map(r => r.first_connected_date).filter(Boolean).sort()
  const telesalesStatus = {
    total_rows:    telesales.count ?? teleData.length,
    total_agents:  agentSet.size,
    earliest_date: teleDates[0] ?? null,
    latest_date:   teleDates[teleDates.length - 1] ?? null,
    last_uploaded: lastUpload['telesales_calls'] ?? null,
  }

  // ── targets ───────────────────────────────────────────────────
  const targetData   = targets.data ?? []
  const targetMonths = [...new Set(targetData.map(r => r.month).filter(Boolean))].sort()
  const targetsStatus = {
    total_rows:     targets.count ?? targetData.length,
    earliest_month: targetMonths[0] ?? null,
    latest_month:   targetMonths[targetMonths.length - 1] ?? null,
    total_target:   targetData.reduce((s, r) => s + Number(r.sales_target ?? 0), 0),
    last_uploaded:  lastUpload['targets'] ?? null,
  }

  // ── costs ─────────────────────────────────────────────────────
  const costsData  = costs.data ?? []
  const costMonths = [...new Set(costsData.map(r => r.month).filter(Boolean))].sort()
  const costsStatus = {
    total_rows:     costs.count ?? costsData.length,
    earliest_month: costMonths[0] ?? null,
    latest_month:   costMonths[costMonths.length - 1] ?? null,
    last_uploaded:  lastUpload['costs'] ?? null,
  }

  // ── incentives ────────────────────────────────────────────────
  const incentiveData = incentives.data ?? []
  const incentivesStatus = {
    total_tiers:   incentives.count ?? incentiveData.length,
    tiers:         incentiveData.map(r => r.tier).sort((a, b) => a - b),
    last_uploaded: lastUpload['incentives'] ?? null,
  }

  return NextResponse.json({
    online_sales:  onlineSalesStatus,
    offline_sales: offlineSalesStatus,
    leads:         leadsStatus,
    products:      productsStatus,
    telesales:     telesalesStatus,
    targets:       targetsStatus,
    costs:         costsStatus,
    incentives:    incentivesStatus,
  })
}
