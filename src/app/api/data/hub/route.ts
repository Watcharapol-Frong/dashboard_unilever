import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
  try {
  const safe = async <T>(sql: string): Promise<T | null> => {
    try { return await queryOne<T>(sql) } catch { return null }
  }

  const [
    summaries,
    lastUploads,
    onlineDates,
    offlineDates,
    productsBrands,
    telesales,
    teleAgents,
    targets,
    costs,
    incentiveRows,
    batches,
    martMain,
    martPerf,
    recentBuilds,
  ] = await Promise.all([
    query<{ table_name: string; total_rows: string; total_sales: string }>(
      `SELECT table_name, total_rows, total_sales FROM table_summaries`
    ),
    query<{ table_name: string; uploaded_at: string }>(
      `SELECT DISTINCT ON (table_name) table_name, uploaded_at
       FROM upload_batches WHERE status IN ('success','partial')
       ORDER BY table_name, uploaded_at DESC`
    ),
    queryOne<{ min_d: string | null; max_d: string | null }>(
      `SELECT MIN(order_date)::text AS min_d, MAX(order_date)::text AS max_d FROM online_sales`
    ),
    queryOne<{ min_d: string | null; max_d: string | null }>(
      `SELECT MIN(order_date)::text AS min_d, MAX(order_date)::text AS max_d FROM offline_sales`
    ),
    query<{ brands: string }>(`SELECT DISTINCT brands FROM products WHERE brands IS NOT NULL`),
    queryOne<{ cnt: string; min_d: string | null; max_d: string | null }>(
      `SELECT COUNT(*) AS cnt,
              MIN(first_connected_date)::text AS min_d,
              MAX(first_connected_date)::text AS max_d
       FROM telesales_calls`
    ),
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
    // Mart stats
    safe<{ cnt: string; min_date: string | null; max_date: string | null; last_refreshed: string | null; avg_days: string | null }>(`
      SELECT COUNT(*) AS cnt,
             MIN(order_date)::text  AS min_date,
             MAX(order_date)::text  AS max_date,
             MAX(refreshed_at)::text AS last_refreshed,
             ROUND(AVG(days_to_order), 1)::text AS avg_days
      FROM sales_hoc_orders
    `),
    safe<{ cnt: string; min_month: string | null; max_month: string | null; last_refreshed: string | null }>(`
      SELECT COUNT(*) AS cnt,
             MIN(month)::text      AS min_month,
             MAX(month)::text      AS max_month,
             MAX(refreshed_at)::text AS last_refreshed
      FROM mart_performance_cmg
    `),
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
      total_rows:    summaryMap['leads']?.total_rows ?? 0,
      last_uploaded: lastUpload['leads'] ?? null,
    },
    products: {
      total_rows:    summaryMap['products']?.total_rows ?? 0,
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

  const mart = {
    main: {
      row_count:         Number(martMain?.cnt ?? 0),
      min_date:          martMain?.min_date ?? null,
      max_date:          martMain?.max_date ?? null,
      last_refreshed:    martMain?.last_refreshed ?? null,
      avg_days_to_order: martMain?.avg_days ? Number(martMain.avg_days) : null,
    },
    performance: {
      row_count:      Number(martPerf?.cnt ?? 0),
      min_month:      martPerf?.min_month ?? null,
      max_month:      martPerf?.max_month ?? null,
      last_refreshed: martPerf?.last_refreshed ?? null,
    },
    recent_builds: recentBuilds,
  }

  const res = NextResponse.json({ status, history: batches, mart })
  res.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
  return res
  } catch (err) {
    console.error('[hub]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  })
}
