import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'

const STATUS_TO_NODE: Record<string, string | null> = {
  'รับสาย': 'Reached', 'ไม่รับสาย': 'No Answer', 'สายไม่ว่าง': 'No Answer',
  'ปิดเครื่อง': 'No Answer', 'เบอร์ไม่ถูกต้อง': 'Invalid',
  'ไม่สนใจ': 'Not Interested', 'สนใจ': 'Interested',
  'สั่งซื้อแล้ว': 'Ordered', 'รอโทรกลับ': 'Reached', 'นัดหมาย': 'Interested',
}

const ALLOWED_GROUP_BY = ['month', 'week', 'day'] as const
type GroupBy = typeof ALLOWED_GROUP_BY[number]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const from = searchParams.get('from') ?? monthStart
  const to   = searchParams.get('to')   ?? today
  const groupBy: GroupBy = ALLOWED_GROUP_BY.includes(searchParams.get('groupBy') as GroupBy)
    ? (searchParams.get('groupBy') as GroupBy)
    : 'month'

  const periodExpr  = `DATE_TRUNC('${groupBy}', first_connected_date)::date`
  const chartFilter = groupBy === 'day' ? 'AND first_connected_date BETWEEN $1 AND $2' : ''
  const chartParams = groupBy === 'day' ? [from, to] : []

  const [callStatusRows, agentRows, byPeriodRows, leadCountRow] = await Promise.all([
    query<{ call_status: string; total: string }>(
      `SELECT call_status, COUNT(*) AS total FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2 GROUP BY call_status ORDER BY total DESC`,
      [from, to]
    ),
    query<{ agent: string; total_calls: string; reached: string; not_reached: string }>(
      `SELECT agent, COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE call_status = 'รับสาย') AS reached,
         COUNT(*) FILTER (WHERE call_status != 'รับสาย') AS not_reached
       FROM telesales_calls WHERE first_connected_date BETWEEN $1 AND $2 AND agent IS NOT NULL
       GROUP BY agent ORDER BY total_calls DESC`,
      [from, to]
    ),
    query<{ period: string; total_calls: string; reached: string }>(
      `SELECT ${periodExpr} AS period, COUNT(*) AS total_calls,
         COUNT(*) FILTER (WHERE call_status = 'รับสาย') AS reached
       FROM telesales_calls WHERE first_connected_date IS NOT NULL ${chartFilter}
       GROUP BY period ORDER BY period`,
      chartParams
    ),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads`),
  ])

  const callStatusMap: Record<string, number> = {}
  for (const r of callStatusRows) callStatusMap[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  const total_calls = Object.values(callStatusMap).reduce((s, v) => s + v, 0)
  const reached     = callStatusMap['รับสาย'] ?? 0

  const by_agent = agentRows.map(r => ({
    agent: r.agent, total_calls: Number(r.total_calls), reached: Number(r.reached), not_reached: Number(r.not_reached),
    reach_rate: Number(r.total_calls) > 0 ? Number(r.reached) / Number(r.total_calls) : 0,
  }))

  const by_period = byPeriodRows.map(r => ({
    period: r.period, total_calls: Number(r.total_calls), reached: Number(r.reached),
  }))

  const lead_count = Number(leadCountRow?.cnt ?? 0)
  let reachedCount = 0, noAnswerCount = 0, interestedCount = 0, orderedCount = 0, notInterested = 0
  for (const [status, cnt] of Object.entries(callStatusMap)) {
    const node = STATUS_TO_NODE[status] ?? 'No Answer'
    if (node === 'Reached')          reachedCount    += cnt
    else if (node === 'No Answer')   noAnswerCount   += cnt
    else if (node === 'Interested')  interestedCount += cnt
    else if (node === 'Ordered')     orderedCount    += cnt
    else if (node === 'Not Interested') notInterested += cnt
    else if (node === 'Invalid')     noAnswerCount   += cnt
  }

  const sankeyNodes = [
    lead_count > 0 ? { id: 'Lead List' } : null,
    total_calls > 0 ? { id: 'Called' } : null,
    reachedCount > 0 ? { id: 'Reached' } : null,
    noAnswerCount > 0 ? { id: 'No Answer' } : null,
    interestedCount > 0 ? { id: 'Interested' } : null,
    orderedCount > 0 ? { id: 'Ordered' } : null,
    notInterested > 0 ? { id: 'Not Interested' } : null,
  ].filter(Boolean) as { id: string }[]

  const sankeyLinks = [
    lead_count > 0 && total_calls > 0 ? { source: 'Lead List', target: 'Called', value: Math.min(lead_count, total_calls) } : null,
    reachedCount > 0 ? { source: 'Called', target: 'Reached', value: reachedCount } : null,
    noAnswerCount > 0 ? { source: 'Called', target: 'No Answer', value: noAnswerCount } : null,
    interestedCount > 0 ? { source: 'Reached', target: 'Interested', value: interestedCount } : null,
    notInterested > 0 ? { source: 'Reached', target: 'Not Interested', value: notInterested } : null,
    orderedCount > 0 ? { source: 'Interested', target: 'Ordered', value: orderedCount } : null,
  ].filter(Boolean)

  return NextResponse.json({
    summary: { total_calls, reached, not_reached: total_calls - reached, call_status_breakdown: callStatusMap },
    by_agent, by_period, sankey: { nodes: sankeyNodes, links: sankeyLinks }, callStatusMap,
  })
}
