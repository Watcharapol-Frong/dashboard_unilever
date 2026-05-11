import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Thai call-status → Sankey English node mapping
const STATUS_TO_NODE: Record<string, string | null> = {
  'รับสาย':       'Reached',
  'ไม่รับสาย':   'No Answer',
  'สายไม่ว่าง':  'No Answer',
  'ปิดเครื่อง':  'No Answer',
  'เบอร์ไม่ถูกต้อง': 'Invalid',
  'ไม่สนใจ':     'Not Interested',
  'สนใจ':        'Interested',
  'สั่งซื้อแล้ว': 'Ordered',
  'รอโทรกลับ':   'Reached',   // reached but callback
  'นัดหมาย':     'Interested',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const today      = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]
  const from = searchParams.get('from') ?? monthStart
  const to   = searchParams.get('to')   ?? today

  const supabase = createServiceClient()

  const [callStatusRes, agentRes, byDateRes, leadCountRes] = await Promise.all([
    // Call status breakdown for period
    supabase.rpc('get_call_status_counts_range', { p_from: from, p_to: to }),

    // Agent performance
    supabase.rpc('get_agent_performance', { p_from: from, p_to: to }),

    // Daily trend
    supabase.rpc('get_telesales_by_date', { p_from: from, p_to: to }),

    // Total lead count
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true }),
  ])

  // ── Call status breakdown ─────────────────────────────────────
  const callStatusRows: { call_status: string; total: number }[] = callStatusRes.data ?? []
  const callStatusMap: Record<string, number> = {}
  for (const r of callStatusRows) {
    callStatusMap[r.call_status ?? 'ไม่ระบุ'] = Number(r.total)
  }
  const total_calls = Object.values(callStatusMap).reduce((s, v) => s + v, 0)
  const reached     = callStatusMap['รับสาย'] ?? 0

  // ── Summary ───────────────────────────────────────────────────
  const summary = {
    total_calls,
    reached,
    not_reached: total_calls - reached,
    call_status_breakdown: callStatusMap,
  }

  // ── Agent performance ─────────────────────────────────────────
  const by_agent = (agentRes.data ?? []).map((r: {
    agent: string;
    total_calls: number;
    reached: number;
    not_reached: number;
  }) => ({
    agent:          r.agent,
    total_calls:    Number(r.total_calls),
    reached:        Number(r.reached),
    not_reached:    Number(r.not_reached),
    reach_rate:     Number(r.total_calls) > 0 ? Number(r.reached) / Number(r.total_calls) : 0,
  }))

  // ── Daily trend ────────────────────────────────────────────────
  const by_date = (byDateRes.data ?? []).map((r: {
    call_date: string;
    total_calls: number;
    reached: number;
  }) => ({
    date:        r.call_date,
    total_calls: Number(r.total_calls),
    reached:     Number(r.reached),
  }))

  // ── Sankey funnel (Lead → Called → Reached / No Answer) ──────
  const lead_count  = leadCountRes.count ?? 0

  // Bucket call statuses into Sankey nodes
  let reachedCount    = 0
  let noAnswerCount   = 0
  let interestedCount = 0
  let orderedCount    = 0
  let notInterested   = 0

  for (const [status, cnt] of Object.entries(callStatusMap)) {
    const node = STATUS_TO_NODE[status] ?? 'No Answer'
    if (node === 'Reached')         reachedCount    += cnt
    else if (node === 'No Answer')  noAnswerCount   += cnt
    else if (node === 'Interested') interestedCount += cnt
    else if (node === 'Ordered')    orderedCount    += cnt
    else if (node === 'Not Interested') notInterested += cnt
    else if (node === 'Invalid')    noAnswerCount   += cnt
  }

  const sankeyNodes = [
    lead_count  > 0 ? { id: 'Lead List' }     : null,
    total_calls > 0 ? { id: 'Called' }         : null,
    reachedCount    > 0 ? { id: 'Reached' }    : null,
    noAnswerCount   > 0 ? { id: 'No Answer' }  : null,
    interestedCount > 0 ? { id: 'Interested' } : null,
    orderedCount    > 0 ? { id: 'Ordered' }    : null,
    notInterested   > 0 ? { id: 'Not Interested' } : null,
  ].filter(Boolean) as { id: string }[]

  const sankeyLinks = [
    lead_count > 0 && total_calls > 0
      ? { source: 'Lead List', target: 'Called', value: Math.min(lead_count, total_calls) }
      : null,
    reachedCount > 0
      ? { source: 'Called', target: 'Reached',   value: reachedCount }  : null,
    noAnswerCount > 0
      ? { source: 'Called', target: 'No Answer', value: noAnswerCount } : null,
    interestedCount > 0
      ? { source: 'Reached', target: 'Interested', value: interestedCount } : null,
    notInterested > 0
      ? { source: 'Reached', target: 'Not Interested', value: notInterested } : null,
    orderedCount > 0
      ? { source: 'Interested', target: 'Ordered', value: orderedCount } : null,
  ].filter(Boolean)

  const sankey = { nodes: sankeyNodes, links: sankeyLinks }

  return NextResponse.json({ summary, by_agent, by_date, sankey, callStatusMap })
}
