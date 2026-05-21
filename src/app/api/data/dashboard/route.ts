import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [
    summaries,
    lastUploads,
    onlineDates,
    offlineDates,
    leadsCount,
    productsCount,
    productsBrands,
    telesales,
    teleAgents,
    targets,
    costs,
    incentiveRows,
    batches,
  ] = await Promise.all([
    // table_summaries: row counts + sales totals (online/offline/etc.)
    query<{ table_name: string; total_rows: string; total_sales: string }>(
      `SELECT table_name, total_rows, total_sales FROM table_summaries`
    ),
    // last successful upload per table
    query<{ table_name: string; uploaded_at: string }>(
      `SELECT DISTINCT ON (table_name) table_name, uploaded_at
       FROM upload_batches WHERE status IN ('success','partial')
       ORDER BY table_name, uploaded_at DESC`
    ),
    // online_sales: min + max date in one query
    queryOne<{ min_d: string | null; max_d: string | null }>(
      `SELECT MIN(order_date)::text AS min_d, MAX(order_date)::text AS max_d FROM online_sales`
    ),
    // offline_sales: min + max date in one query
    queryOne<{ min_d: string | null; max_d: string | null }>(
      `SELECT MIN(order_date)::text AS min_d, MAX(order_date)::text AS max_d FROM offline_sales`
    ),
    // leads count (fallback if not in table_summaries)
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads`),
    // products count (fallback)
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM products`),
    // products: distinct brands
    query<{ brands: string }>(`SELECT DISTINCT brands FROM products WHERE brands IS NOT NULL`),
    // telesales: count + date range in one query (not from table_summaries — always real)
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null }>(
      `SELECT COUNT(*) AS cnt,
              MIN(first_connected_date)::text AS min_d,
              MAX(first_connected_date)::text AS max_d
       FROM telesales_calls`
    ),
    // telesales: distinct agents (separate — DISTINCT pattern)
    query<{ agent: string }>(`SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL`),
    // targets: count + date range + sum in one query
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null; total: string }>(
      `SELECT COUNT(*) AS cnt,
              MIN(month)::text AS min_d,
              MAX(month)::text AS max_d,
              COALESCE(SUM(sales_target), 0)::text AS total
       FROM targets`
    ),
    // costs: count + date range in one query
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null }>(
      `SELECT COUNT(*) AS cnt,
              MIN(month)::text AS min_d,
              MAX(month)::text AS max_d
       FROM costs`
    ),
    // incentives: tiers
    query<{ tier: number }>(`SELECT tier FROM incentives ORDER BY tier`),
    // upload history (last 50)
    query<{
      id: string; table_name: string; filename: string | null
      row_count: number | null; error_count: number
      status: string; uploaded_at: string; uploaded_by: string | null
    }>(
      `SELECT id, table_name, filename, row_count, error_count, status, uploaded_at, uploaded_by
       FROM upload_batches ORDER BY uploaded_at DESC LIMIT 50`
    ),
  ])

  const summaryMap: Record<string, { total_rows: number; total_sales: number }> = {}
  for (const s of summaries) {
    summaryMap[s.table_name] = {
      total_rows:  Number(s.total_rows  || 0),
      total_sales: Number(s.total_sales || 0),
    }
  }

  const lastUpload: Record<string, string> = {}
  for (const b of lastUploads) lastUpload[b.table_name] = b.uploaded_at

  const status = {
    online_sales: {
      total_rows:    summaryMap['online_sales']?.total_rows  ?? 0,
      total_sales:   summaryMap['online_sales']?.total_sales ?? 0,
      earliest_date: onlineDates?.min_d ?? null,
      latest_date:   onlineDates?.max_d ?? null,
      last_uploaded: lastUpload['online_sales'] ?? null,
    },
    offline_sales: {
      total_rows:    summaryMap['offline_sales']?.total_rows  ?? 0,
      total_sales:   summaryMap['offline_sales']?.total_sales ?? 0,
      earliest_date: offlineDates?.min_d ?? null,
      latest_date:   offlineDates?.max_d ?? null,
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
      total_rows:    Number(telesales?.cnt ?? 0),
      total_agents:  teleAgents.length,
      earliest_date: telesales?.min_d ?? null,
      latest_date:   telesales?.max_d ?? null,
      last_uploaded: lastUpload['telesales_calls'] ?? null,
    },
    targets: {
      total_rows:     Number(targets?.cnt ?? 0),
      earliest_month: targets?.min_d ?? null,
      latest_month:   targets?.max_d ?? null,
      total_target:   Number(targets?.total ?? 0),
      last_uploaded:  lastUpload['targets'] ?? null,
    },
    costs: {
      total_rows:     Number(costs?.cnt ?? 0),
      earliest_month: costs?.min_d ?? null,
      latest_month:   costs?.max_d ?? null,
      last_uploaded:  lastUpload['costs'] ?? null,
    },
    incentives: {
      total_tiers:   incentiveRows.length,
      tiers:         incentiveRows.map(r => Number(r.tier)).sort((a, b) => a - b),
      last_uploaded: lastUpload['incentives'] ?? null,
    },
  }

  return NextResponse.json({ status, history: batches })
}
