import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [
    summaries,
    lastUploads,
    onlineMinDate, onlineMaxDate,
    offlineMinDate, offlineMaxDate,
    leadsCount,
    productsCount, productsBrands,
    teleCount, teleMinDate, teleMaxDate, teleAgents,
    targetsCount, targetsMinMonth, targetsMaxMonth, targetsSum,
    costsCount, costsMinMonth, costsMaxMonth,
    incentiveRows,
  ] = await Promise.all([
    // 0. Aggregated Summaries (FASTER than COUNT(*) on large tables)
    query<{ table_name: string; total_rows: string; total_sales: string }>(
      `SELECT table_name, total_rows, total_sales FROM table_summaries`
    ),
    // 1. Last upload per table
    query<{ table_name: string; uploaded_at: string }>(
      `SELECT DISTINCT ON (table_name) table_name, uploaded_at FROM upload_batches WHERE status IN ('success','partial') ORDER BY table_name, uploaded_at DESC`
    ),
    // Date ranges (still using indexes, usually fast)
    queryOne<{ d: string }>(`SELECT MIN(order_date)::text AS d FROM online_sales`),
    queryOne<{ d: string }>(`SELECT MAX(order_date)::text AS d FROM online_sales`),
    queryOne<{ d: string }>(`SELECT MIN(order_date)::text AS d FROM offline_sales`),
    queryOne<{ d: string }>(`SELECT MAX(order_date)::text AS d FROM offline_sales`),
    
    // Fallbacks if summaries are missing for small tables
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

  // Map summaries for easy access
  const summaryMap: Record<string, { total_rows: number; total_sales: number }> = {}
  for (const s of summaries) {
    summaryMap[s.table_name] = {
      total_rows: Number(s.total_rows || 0),
      total_sales: Number(s.total_sales || 0)
    }
  }

  const lastUpload: Record<string, string> = {}
  for (const b of lastUploads) lastUpload[b.table_name] = b.uploaded_at

  return NextResponse.json({
    online_sales: {
      total_rows:    summaryMap['online_sales']?.total_rows ?? 0,
      total_sales:   summaryMap['online_sales']?.total_sales ?? 0,
      earliest_date: onlineMinDate?.d ?? null,
      latest_date:   onlineMaxDate?.d ?? null,
      last_uploaded: lastUpload['online_sales'] ?? null,
    },
    offline_sales: {
      total_rows:    summaryMap['offline_sales']?.total_rows ?? 0,
      total_sales:   summaryMap['offline_sales']?.total_sales ?? 0,
      earliest_date: offlineMinDate?.d ?? null,
      latest_date:   offlineMaxDate?.d ?? null,
      last_uploaded: lastUpload['offline_sales'] ?? null,
    },
    leads: {
      total_rows:    summaryMap['leads']?.total_rows ?? Number(leadsCount?.cnt ?? 0),
      last_uploaded: lastUpload['leads'] ?? null,
    },
    products: {
      total_rows:    summaryMap['products']?.total_rows ?? Number(productsCount?.cnt ?? 0),
      total_brands:  new Set(productsBrands.map(r => r.brands)).size,
      last_uploaded: lastUpload['products'] ?? null,
    },
    telesales: {
      total_rows:    summaryMap['telesales_calls']?.total_rows ?? Number(teleCount?.cnt ?? 0),
      total_agents:  teleAgents.length,
      earliest_date: teleMinDate?.d ?? null,
      latest_date:   teleMaxDate?.d ?? null,
      last_uploaded: lastUpload['telesales_calls'] ?? null,
    },
    targets: {
      total_rows:     summaryMap['targets']?.total_rows ?? Number(targetsCount?.cnt ?? 0),
      earliest_month: targetsMinMonth?.d ?? null,
      latest_month:   targetsMaxMonth?.d ?? null,
      total_target:   summaryMap['targets']?.total_sales ?? Number(targetsSum?.total ?? 0),
      last_uploaded:  lastUpload['targets'] ?? null,
    },
    costs: {
      total_rows:     summaryMap['costs']?.total_rows ?? Number(costsCount?.cnt ?? 0),
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
