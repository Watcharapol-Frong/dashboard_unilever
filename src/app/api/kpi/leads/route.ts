import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')   ?? '1'))
  const limit  = Math.min(100, parseInt(searchParams.get('limit')  ?? '50'))
  const filter = searchParams.get('filter') ?? 'all'
  const offset = (page - 1) * limit

  const [leadsCount, calledCount, callStatusRows, tierRows, agentRows, reasonRows] = await Promise.all([
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM telesales_calls`),
    query<{ call_status: string; total: string }>(`SELECT call_status, COUNT(*) AS total FROM telesales_calls GROUP BY call_status ORDER BY total DESC`),
    query<{ category: string; total: string; called: string; not_called: string }>(
      `SELECT l.lead_customers AS category, COUNT(*) AS total, COUNT(t.mmid) AS called, COUNT(*) - COUNT(t.mmid) AS not_called
       FROM leads l LEFT JOIN telesales_calls t ON t.mmid = l.mmid GROUP BY l.lead_customers ORDER BY l.lead_customers`
    ),
    query<{ agent: string; total_calls: string; reached: string }>(
      `SELECT agent, COUNT(*) AS total_calls, COUNT(*) FILTER (WHERE call_status = 'รับสาย') AS reached FROM telesales_calls WHERE agent IS NOT NULL GROUP BY agent ORDER BY total_calls DESC`
    ),
    query<{ reason_group: string; total: string }>(
      `SELECT COALESCE(reason_group,'ไม่ระบุ') AS reason_group, COUNT(*) AS total FROM telesales_calls GROUP BY reason_group ORDER BY total DESC`
    ),
  ])

  const callStatusCounts: Record<string, number> = {}
  for (const r of callStatusRows) callStatusCounts[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  const reached   = callStatusCounts['รับสาย'] ?? 0
  const total     = Number(leadsCount?.cnt ?? 0)
  const called    = Number(calledCount?.cnt ?? 0)
  const notCalled = Math.max(0, total - called)

  const tierBreakdown = tierRows.map(r => ({
    category: r.category ?? 'ไม่ระบุ', total: Number(r.total), called: Number(r.called), notCalled: Number(r.not_called),
  }))
  const agentPerformance = agentRows.map(r => ({
    agent: r.agent, totalCalls: Number(r.total_calls), reached: Number(r.reached),
    reachRate: Number(r.total_calls) > 0 ? Math.round((Number(r.reached) / Number(r.total_calls)) * 100) : 0,
  }))
  const reasonGroups = reasonRows.map(r => ({ reasonGroup: r.reason_group, total: Number(r.total) }))

  // Actions table with filter
  let filterWhere = ''
  const filterParams: unknown[] = [limit, offset]
  if (filter === 'retry') {
    filterWhere = `WHERE call_status = ANY(ARRAY['ไม่รับสาย 1','สายไม่ว่าง','ฝากข้อความ'])`
  } else if (filter === 'reached') {
    filterWhere = `WHERE call_status = 'รับสาย'`
  } else if (filter === 'invalid') {
    filterWhere = `WHERE call_status = 'หมายเลขไม่ถูกต้อง'`
  }

  const [rows, rowsTotalRow] = await Promise.all([
    query<{ mmid: string; mobile: string|null; call_status: string|null; agent: string|null; first_connected_date: string|null; reason_group: string|null; lead_customers: string|null }>(
      `SELECT mmid, mobile, call_status, agent, first_connected_date::text AS first_connected_date, reason_group, lead_customers
       FROM telesales_calls ${filterWhere}
       ORDER BY first_connected_date DESC NULLS LAST LIMIT $1 OFFSET $2`,
      filterParams
    ),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM telesales_calls ${filterWhere}`),
  ])

  return NextResponse.json({
    total, called, notCalled, reached,
    reachRate: called > 0 ? Math.round((reached / called) * 100) : 0,
    callStatusCounts, tierBreakdown, agentPerformance, reasonGroups,
    rows, rowsTotal: Number(rowsTotalRow?.cnt ?? 0),
    page, limit, filter,
  })
}
