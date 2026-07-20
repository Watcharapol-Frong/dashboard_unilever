import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
  try {
  const [
    summaries,
    lastUploads,
    productsBrands,
    teleAgents,
    targets,
    costs,
    incentiveRows,
    batches,
    recentBuilds,
  ] = await Promise.all([
    // Pre-aggregated by refreshTableSummaries() as part of the mart build —
    // covers online_sales, offline_sales, telesales_calls, sales_hoc_orders,
    // mart_performance_cmg. Avoids live COUNT(*)/MIN/MAX/AVG scans on every
    // Data Hub page view.
    query<{
      table_name: string; total_rows: string; total_sales: string
      min_date: string | null; max_date: string | null
      extra_metric: string | null; last_updated: string
    }>(
      `SELECT table_name, total_rows, total_sales, min_date::text AS min_date,
              max_date::text AS max_date, extra_metric::text AS extra_metric, last_updated::text AS last_updated
       FROM table_summaries`
    ),
    query<{ table_name: string; uploaded_at: string }>(
      `SELECT DISTINCT ON (table_name) table_name, uploaded_at
       FROM upload_batches WHERE status IN ('success','partial')
       ORDER BY table_name, uploaded_at DESC`
    ),
    query<{ brands: string }>(`SELECT DISTINCT brands FROM products WHERE brands IS NOT NULL`),
    query<{ agent: string }>(`SELECT DISTINCT agent FROM telesales_calls WHERE agent IS NOT NULL`),
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null; total: string }>(
      `SELECT COUNT(*) AS cnt,
              MIN(month)::text AS min_d,
              MAX(month)::text AS max_d,
              COALESCE(SUM(sales_target), 0)::text AS total
       FROM targets`
    ),
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null }>(
      `SELECT COUNT(*) AS cnt,
              MIN(month)::text AS min_d,
              MAX(month)::text AS max_d
       FROM costs`
    ),
    query<{ tier: number }>(`SELECT tier FROM incentives ORDER BY tier`),
    query<{
      id: string; table_name: string; filename: string | null
      row_count: number | null; error_count: number
      status: string; uploaded_at: string; uploaded_by: string | null
    }>(
      `SELECT id, table_name, filename, row_count, error_count, status, uploaded_at, uploaded_by
       FROM upload_batches ORDER BY uploaded_at DESC LIMIT 50`
    ),
    (async () => {
      try {
        return await query<{
          id: string; started_at: string; finished_at: string | null
          attribution_days: number | null; duration_ms: number | null
          status: string; row_counts: Record<string, number> | null; error_message: string | null
        }>(`
          SELECT id::text, started_at::text, finished_at::text,
                 attribution_days, duration_ms, status, row_counts, error_message
          FROM mart_builds ORDER BY id DESC LIMIT 5
        `)
      } catch { return [] }
    })(),
  ])

  const summaryMap: Record<string, {
    total_rows: number; total_sales: number
    min_date: string | null; max_date: string | null
    extra_metric: number | null; last_updated: string | null
  }> = {}
  for (const s of summaries) {
    summaryMap[s.table_name] = {
      total_rows:   Number(s.total_rows  || 0),
      total_sales:  Number(s.total_sales || 0),
      min_date:     s.min_date ?? null,
      max_date:     s.max_date ?? null,
      extra_metric: s.extra_metric != null ? Number(s.extra_metric) : null,
      last_updated: s.last_updated ?? null,
    }
  }

  const lastUpload: Record<string, string> = {}
  for (const b of lastUploads) lastUpload[b.table_name] = b.uploaded_at

  const status = {
    online_sales: {
      total_rows:    summaryMap['online_sales']?.total_rows  ?? 0,
      total_sales:   summaryMap['online_sales']?.total_sales ?? 0,
      earliest_date: summaryMap['online_sales']?.min_date ?? null,
      latest_date:   summaryMap['online_sales']?.max_date ?? null,
      last_uploaded: lastUpload['online_sales'] ?? null,
    },
    offline_sales: {
      total_rows:    summaryMap['offline_sales']?.total_rows  ?? 0,
      total_sales:   summaryMap['offline_sales']?.total_sales ?? 0,
      earliest_date: summaryMap['offline_sales']?.min_date ?? null,
      latest_date:   summaryMap['offline_sales']?.max_date ?? null,
      last_uploaded: lastUpload['offline_sales'] ?? null,
    },
    leads: {
      total_rows:    summaryMap['leads']?.total_rows ?? 0,
      last_uploaded: lastUpload['leads'] ?? null,
    },
    products: {
      total_rows:    summaryMap['products']?.total_rows ?? 0,
      total_brands:  new Set(productsBrands.map(r => r.brands)).size,
      last_uploaded: lastUpload['products'] ?? null,
    },
    telesales: {
      total_rows:    summaryMap['telesales_calls']?.total_rows ?? 0,
      total_agents:  teleAgents.length,
      earliest_date: summaryMap['telesales_calls']?.min_date ?? null,
      latest_date:   summaryMap['telesales_calls']?.max_date ?? null,
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

  const mart = {
    main: {
      row_count:         summaryMap['sales_hoc_orders']?.total_rows ?? 0,
      min_date:          summaryMap['sales_hoc_orders']?.min_date ?? null,
      max_date:          summaryMap['sales_hoc_orders']?.max_date ?? null,
      last_refreshed:    summaryMap['sales_hoc_orders']?.last_updated ?? null,
      avg_days_to_order: summaryMap['sales_hoc_orders']?.extra_metric ?? null,
    },
    performance: {
      row_count:      summaryMap['mart_performance_cmg']?.total_rows ?? 0,
      min_month:      summaryMap['mart_performance_cmg']?.min_date ?? null,
      max_month:      summaryMap['mart_performance_cmg']?.max_date ?? null,
      last_refreshed: summaryMap['mart_performance_cmg']?.last_updated ?? null,
    },
    recent_builds: recentBuilds,
  }

  const res = NextResponse.json({ status, history: batches, mart })
  setCacheHeader(res, 'SHORT')
  return res
  } catch (err) {
    console.error('[hub]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  })
}
