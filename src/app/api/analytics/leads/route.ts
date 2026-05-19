import { NextResponse } from 'next/server'
import { query, queryOne, queryCount } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')   ?? '1'))
  const limit  = Math.min(100, parseInt(searchParams.get('limit')  ?? '50'))
  const filter = searchParams.get('filter') ?? 'all'
  const from   = (page - 1) * limit

  const [total, called] = await Promise.all([
    queryCount('SELECT COUNT(*) FROM leads'),
    queryCount('SELECT COUNT(*) FROM telesales_calls'),
  ])

  // ── Call status breakdown ─────────────────────────────────
  const statusRows = await query<{ call_status: string | null; total: string }>(
    `SELECT call_status, COUNT(*) AS total
     FROM telesales_calls
     GROUP BY call_status
     ORDER BY total DESC`
  )
  const callStatusCounts: Record<string, number> = {}
  for (const r of statusRows) {
    callStatusCounts[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  }
  const reached   = callStatusCounts['รับสาย'] ?? 0
  const notCalled = Math.max(0, total - called)

  // ── Tier breakdown (by lead_customers) ────────────────────
  const tierRows = await query<{ category: string | null; total: string; called: string; not_called: string }>(
    `SELECT
       l.lead_customers                                  AS category,
       COUNT(DISTINCT l.mmid)                            AS total,
       COUNT(DISTINCT t.mmid)                            AS called,
       COUNT(DISTINCT l.mmid) - COUNT(DISTINCT t.mmid)  AS not_called
     FROM leads l
     LEFT JOIN telesales_calls t ON t.mmid = l.mmid
     GROUP BY l.lead_customers
     ORDER BY total DESC`
  )
  const tierBreakdown = tierRows.map(r => ({
    category:  r.category ?? 'ไม่ระบุ',
    total:     Number(r.total),
    called:    Number(r.called),
    notCalled: Number(r.not_called),
  }))

  // ── Agent performance ─────────────────────────────────────
  const agentRows = await query<{ agent: string | null; total_calls: string; reached: string }>(
    `SELECT
       agent,
       COUNT(*)                                            AS total_calls,
       COUNT(*) FILTER (WHERE call_status = 'รับสาย')    AS reached
     FROM telesales_calls
     WHERE agent IS NOT NULL
     GROUP BY agent
     ORDER BY total_calls DESC`
  )
  const agentPerformance = agentRows.map(r => ({
    agent:      r.agent ?? '',
    totalCalls: Number(r.total_calls),
    reached:    Number(r.reached),
    reachRate:  Number(r.total_calls) > 0
      ? Math.round((Number(r.reached) / Number(r.total_calls)) * 100)
      : 0,
  }))

  // ── Reason group breakdown ────────────────────────────────
  const reasonRows = await query<{ reason_group: string | null; total: string }>(
    `SELECT reason_group, COUNT(*) AS total
     FROM telesales_calls
     WHERE reason_group IS NOT NULL
     GROUP BY reason_group
     ORDER BY total DESC`
  )
  const reasonGroups = reasonRows.map(r => ({
    reasonGroup: r.reason_group ?? '',
    total:       Number(r.total),
  }))

  // ── Actions table: paginated telesales_calls ──────────────
  const filterClause =
    filter === 'retry'   ? `AND call_status IN ('ไม่รับสาย 1','สายไม่ว่าง','ฝากข้อความ')`
    : filter === 'reached' ? `AND call_status = 'รับสาย'`
    : filter === 'invalid' ? `AND call_status = 'หมายเลขไม่ถูกต้อง'`
    : ''

  const [rows, rowsTotal] = await Promise.all([
    query(
      `SELECT mmid, mobile, call_status, agent, first_connected_date, reason_group, reason_subgroup, lead_customers
       FROM telesales_calls
       WHERE 1=1 ${filterClause}
       ORDER BY first_connected_date DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, from],
    ),
    queryCount(
      `SELECT COUNT(*) FROM telesales_calls WHERE 1=1 ${filterClause}`
    ),
  ])

  return NextResponse.json({
    total,
    called,
    notCalled,
    reached,
    reachRate: called > 0 ? Math.round((reached / called) * 100) : 0,
    callStatusCounts,
    tierBreakdown,
    agentPerformance,
    reasonGroups,
    rows,
    rowsTotal,
    page,
    limit,
    filter,
  })
}
