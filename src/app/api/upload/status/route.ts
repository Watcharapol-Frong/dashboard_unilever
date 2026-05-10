import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const [
    orderSales,
    leads,
    products,
    telesales,
    targets,
    costs,
    incentives,
  ] = await Promise.all([
    // order_sales — split by channel
    supabase.from('order_sales').select('order_date, sales_in_vat, channel, created_at'),
    supabase.from('leads').select('mmid, updated_at'),
    supabase.from('products').select('prod_num, brands, updated_at'),
    supabase.from('telesales_calls').select('mmid, first_connected_date, agent, updated_at'),
    supabase.from('targets').select('month, dynamic_cmg, sales_target, updated_at'),
    supabase.from('costs').select('month, updated_at'),
    supabase.from('incentives').select('tier, updated_at'),
  ])

  // ── order_sales ───────────────────────────────────────────
  const rows = orderSales.data ?? []
  const online  = rows.filter(r => r.channel === 'Online')
  const offline = rows.filter(r => r.channel === 'Offline')
  const allDates = rows.map(r => r.order_date).filter(Boolean).sort()
  const allCreated = rows.map(r => r.created_at).filter(Boolean).sort()

  const orderSalesStatus = {
    total_rows:     rows.length,
    online_rows:    online.length,
    offline_rows:   offline.length,
    total_sales:    rows.reduce((s, r) => s + Number(r.sales_in_vat ?? 0), 0),
    online_sales:   online.reduce((s, r) => s + Number(r.sales_in_vat ?? 0), 0),
    offline_sales:  offline.reduce((s, r) => s + Number(r.sales_in_vat ?? 0), 0),
    earliest_date:  allDates[0] ?? null,
    latest_date:    allDates[allDates.length - 1] ?? null,
    last_uploaded:  allCreated[allCreated.length - 1] ?? null,
  }

  // ── leads ─────────────────────────────────────────────────
  const leadsData = leads.data ?? []
  const leadsUpdated = leadsData.map(r => r.updated_at).filter(Boolean).sort()
  const leadsStatus = {
    total_rows:    leadsData.length,
    last_uploaded: leadsUpdated[leadsUpdated.length - 1] ?? null,
  }

  // ── products ──────────────────────────────────────────────
  const prodData = products.data ?? []
  const prodUpdated = prodData.map(r => r.updated_at).filter(Boolean).sort()
  const brandSet = new Set(prodData.map(r => r.brands).filter(Boolean))
  const productsStatus = {
    total_rows:    prodData.length,
    total_brands:  brandSet.size,
    last_uploaded: prodUpdated[prodUpdated.length - 1] ?? null,
  }

  // ── telesales ─────────────────────────────────────────────
  const teleData = telesales.data ?? []
  const teleUpdated = teleData.map(r => r.updated_at).filter(Boolean).sort()
  const agentSet = new Set(teleData.map(r => r.agent).filter(Boolean))
  const teleDates = teleData.map(r => r.first_connected_date).filter(Boolean).sort()
  const telesalesStatus = {
    total_rows:      teleData.length,
    total_agents:    agentSet.size,
    earliest_date:   teleDates[0] ?? null,
    latest_date:     teleDates[teleDates.length - 1] ?? null,
    last_uploaded:   teleUpdated[teleUpdated.length - 1] ?? null,
  }

  // ── targets ───────────────────────────────────────────────
  const targetData = targets.data ?? []
  const targetUpdated = targetData.map(r => r.updated_at).filter(Boolean).sort()
  const targetMonths = [...new Set(targetData.map(r => r.month).filter(Boolean))].sort()
  const targetsStatus = {
    total_rows:      targetData.length,
    earliest_month:  targetMonths[0] ?? null,
    latest_month:    targetMonths[targetMonths.length - 1] ?? null,
    total_target:    targetData.reduce((s, r) => s + Number(r.sales_target ?? 0), 0),
    last_uploaded:   targetUpdated[targetUpdated.length - 1] ?? null,
  }

  // ── costs ─────────────────────────────────────────────────
  const costsData = costs.data ?? []
  const costsUpdated = costsData.map(r => r.updated_at).filter(Boolean).sort()
  const costMonths = [...new Set(costsData.map(r => r.month).filter(Boolean))].sort()
  const costsStatus = {
    total_rows:     costsData.length,
    earliest_month: costMonths[0] ?? null,
    latest_month:   costMonths[costMonths.length - 1] ?? null,
    last_uploaded:  costsUpdated[costsUpdated.length - 1] ?? null,
  }

  // ── incentives ────────────────────────────────────────────
  const incentiveData = incentives.data ?? []
  const incUpdated = incentiveData.map(r => r.updated_at).filter(Boolean).sort()
  const incentivesStatus = {
    total_tiers:   incentiveData.length,
    tiers:         incentiveData.map(r => r.tier).sort((a, b) => a - b),
    last_uploaded: incUpdated[incUpdated.length - 1] ?? null,
  }

  return NextResponse.json({
    order_sales: orderSalesStatus,
    leads:       leadsStatus,
    products:    productsStatus,
    telesales:   telesalesStatus,
    targets:     targetsStatus,
    costs:       costsStatus,
    incentives:  incentivesStatus,
  })
}
