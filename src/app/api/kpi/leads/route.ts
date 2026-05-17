import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')   ?? '1'))
  const limit  = Math.min(100, parseInt(searchParams.get('limit')  ?? '50'))
  const filter = searchParams.get('filter') ?? 'all'   // all | retry | reached | invalid
  const from   = (page - 1) * limit
  const to     = from + limit - 1

  // ── Aggregate queries (Problems + Reasons) ───────────────────────────────
  const [
    leadsCount,
    calledCount,
    callStatusRows,
    tierRows,
    agentRows,
    reasonRows,
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('telesales_calls').select('*', { count: 'exact', head: true }),
    supabase.rpc('get_call_status_counts'),
    supabase.rpc('get_tier_breakdown'),
    supabase.rpc('get_agent_performance'),
    supabase.rpc('get_reason_group_counts'),
  ])

  const callStatusCounts: Record<string, number> = {}
  for (const row of callStatusRows.data ?? []) {
    callStatusCounts[row.call_status ?? 'ไม่ระบุ'] = Number(row.total)
  }
  const reached   = callStatusCounts['รับสาย'] ?? 0
  const total     = leadsCount.count  ?? 0
  const called    = calledCount.count ?? 0
  const notCalled = Math.max(0, total - called)

  const tierBreakdown = (tierRows.data ?? []).map((r: {
    category: string | null; total: number; called: number; not_called: number
  }) => ({
    category:  r.category ?? 'ไม่ระบุ',
    total:     Number(r.total),
    called:    Number(r.called),
    notCalled: Number(r.not_called),
  }))

  const agentPerformance = (agentRows.data ?? []).map((r: {
    agent: string; total_calls: number; reached: number
  }) => ({
    agent:      r.agent,
    totalCalls: Number(r.total_calls),
    reached:    Number(r.reached),
    reachRate:  r.total_calls > 0 ? Math.round((Number(r.reached) / Number(r.total_calls)) * 100) : 0,
  }))

  const reasonGroups = (reasonRows.data ?? []).map((r: {
    reason_group: string; total: number
  }) => ({
    reasonGroup: r.reason_group,
    total:       Number(r.total),
  }))

  // ── Actions table: paginated telesales_calls with filter ─────────────────
  let query = supabase
    .from('telesales_calls')
    .select('mmid, mobile, call_status, agent, first_connected_date, reason_group, reason_subgroup, lead_customers', { count: 'exact' })

  if (filter === 'retry') {
    query = query.in('call_status', ['ไม่รับสาย 1', 'สายไม่ว่าง', 'ฝากข้อความ'])
  } else if (filter === 'reached') {
    query = query.eq('call_status', 'รับสาย')
  } else if (filter === 'invalid') {
    query = query.eq('call_status', 'หมายเลขไม่ถูกต้อง')
  }

  const { data: rows, count: rowsTotal } = await query
    .order('first_connected_date', { ascending: false, nullsFirst: false })
    .range(from, to)

  return NextResponse.json({
    // Problems
    total,
    called,
    notCalled,
    reached,
    reachRate: called > 0 ? Math.round((reached / called) * 100) : 0,

    // Reasons
    callStatusCounts,
    tierBreakdown,
    agentPerformance,
    reasonGroups,

    // Actions
    rows:      rows ?? [],
    rowsTotal: rowsTotal ?? 0,
    page,
    limit,
    filter,
  })
}
