import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [
    lastUploads,
    salesTotals,
    onlineMinDate, onlineMaxDate,
    offlineMinDate, offlineMaxDate,
    leadsCount,
    productsCount, productsBrands,
    teleCount, teleMinDate, teleMaxDate, teleAgents,
    targetsCount, targetsMinMonth, targetsMaxMonth, targetsSum,
    costsCount, costsMinMonth, costsMaxMonth,
    incentiveRows,
  ] = await Promise.all([
    // Last upload per table
    query<{ table_name: string; uploaded_at: string }>(
      `SELECT DISTINCT ON (table_name) table_name, uploaded_at FROM upload_batches WHERE status IN ('success','partial') ORDER BY table_name, uploaded_at DESC`
    ),
    // Sales totals (all time)
    query<{ channel: string; total_rows: string; total_sales: string }>(
      `SELECT 'online' AS channel, COUNT(*) AS total_rows, COALESCE(SUM(sales_in_vat),0) AS total_sales FROM online_sales
       UNION ALL SELECT 'offline', COUNT(*), COALESCE(SUM(sales_in_vat),0) FROM offline_sales`
    ),
    queryOne<{ d: string }>(`SELECT MIN(order_date)::text AS d FROM online_sales`),
    queryOne<{ d: string }>(`SELECT MAX(order_date)::text AS d FROM online_sales`),
    queryOne<{ d: string }>(`SELECT MIN(order_date)::text AS d FROM offline_sales`),
    queryOne<{ d: string }>(`SELECT MAX(order_date)::text AS d FROM offline_sales`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM products`),
    query<{ brands: string }>(`SELECT DISTINCT brands FROM products WHERE brands IS NOT NULL`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM telesales_calls`),
    queryOne<{ d: string }>(`SELECT MIN(first_connected_date)::text AS d FROM telesales_calls WHERE first_connected_date IS NOT NULL`),
    queryOne<{ d: string }>(`SELECT MAX(first_connected_date)::text AS d FROM telesales_calls WHERE first_connected_date IS NOT NULL`),
    query<{ agent: string }>(`SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM targets`),
    queryOne<{ d: string }>(`SELECT MIN(month)::text AS d FROM targets WHERE month IS NOT NULL`),
    queryOne<{ d: string }>(`SELECT MAX(month)::text AS d FROM targets WHERE month IS NOT NULL`),
    queryOne<{ total: string }>(`SELECT COALESCE(SUM(sales_target),0) AS total FROM targets`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM costs`),
    queryOne<{ d: string }>(`SELECT MIN(month)::text AS d FROM costs WHERE month IS NOT NULL`),
    queryOne<{ d: string }>(`SELECT MAX(month)::text AS d FROM costs WHERE month IS NOT NULL`),
    query<{ tier: number }>(`SELECT tier FROM incentives ORDER BY tier`),
  ])

  const lastUpload: Record<string, string> = {}
  for (const b of lastUploads) lastUpload[b.table_name] = b.uploaded_at

  const onlineAgg  = salesTotals.find(r => r.channel === 'online')
  const offlineAgg = salesTotals.find(r => r.channel === 'offline')

  return NextResponse.json({
    online_sales: {
      total_rows:    Number(onlineAgg?.total_rows ?? 0),
      total_sales:   Number(onlineAgg?.total_sales ?? 0),
      earliest_date: onlineMinDate?.d ?? null,
      latest_date:   onlineMaxDate?.d ?? null,
      last_uploaded: lastUpload['online_sales'] ?? null,
    },
    offline_sales: {
      total_rows:    Number(offlineAgg?.total_rows ?? 0),
      total_sales:   Number(offlineAgg?.total_sales ?? 0),
      earliest_date: offlineMinDate?.d ?? null,
      latest_date:   offlineMaxDate?.d ?? null,
      last_uploaded: lastUpload['offline_sales'] ?? null,
    },
    leads: {
      total_rows:    Number(leadsCount?.cnt ?? 0),
      last_uploaded: lastUpload['leads'] ?? null,
    },
    products: {
      total_rows:    Number(productsCount?.cnt ?? 0),
      total_brands:  new Set(productsBrands.map(r => r.brands)).size,
      last_uploaded: lastUpload['products'] ?? null,
    },
    telesales: {
      total_rows:    Number(teleCount?.cnt ?? 0),
      total_agents:  teleAgents.length,
      earliest_date: teleMinDate?.d ?? null,
      latest_date:   teleMaxDate?.d ?? null,
      last_uploaded: lastUpload['telesales_calls'] ?? null,
    },
    targets: {
      total_rows:     Number(targetsCount?.cnt ?? 0),
      earliest_month: targetsMinMonth?.d ?? null,
      latest_month:   targetsMaxMonth?.d ?? null,
      total_target:   Number(targetsSum?.total ?? 0),
      last_uploaded:  lastUpload['targets'] ?? null,
    },
    costs: {
      total_rows:     Number(costsCount?.cnt ?? 0),
      earliest_month: costsMinMonth?.d ?? null,
      latest_month:   costsMaxMonth?.d ?? null,
      last_uploaded:  lastUpload['costs'] ?? null,
    },
    incentives: {
      total_tiers:   incentiveRows.length,
      tiers:         incentiveRows.map(r => Number(r.tier)).sort((a, b) => a - b),
      last_uploaded: lastUpload['incentives'] ?? null,
    },
  })
}
