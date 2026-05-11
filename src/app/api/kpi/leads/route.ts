import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  // ── 1. Total leads count ──────────────────────────────────
  const { count: total } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  // ── 2. Called count (mmid exists in telesales_calls) ─────
  const { count: called } = await supabase
    .from('telesales_calls')
    .select('*', { count: 'exact', head: true })

  // ── 3. Call status breakdown (RPC — no row cap) ──────────
  const { data: callStatusRows } = await supabase
    .rpc('get_call_status_counts')

  const callStatusCounts: Record<string, number> = {}
  for (const row of callStatusRows ?? []) {
    callStatusCounts[row.call_status ?? 'ไม่ระบุ'] = Number(row.total)
  }
  const reached = callStatusCounts['รับสาย'] ?? 0

  // ── 4. Tier breakdown (RPC — no row cap) ─────────────────
  const { data: tierRows } = await supabase
    .rpc('get_tier_breakdown')

  const tierBreakdown = (tierRows ?? []).map((r: { category: string | null; total: number; called: number; not_called: number }) => ({
    category:  r.category ?? 'ไม่ระบุ',
    total:     Number(r.total),
    called:    Number(r.called),
    notCalled: Number(r.not_called),
  }))

  // ── 5. Paginated leads ────────────────────────────────────
  const { data: leadsPage } = await supabase
    .from('leads')
    .select('mmid, cust_name, mobile, lead_customers, updated_at')
    .order('updated_at', { ascending: false })
    .range(from, to)

  // ── 6. Fetch telesales_calls for this page's mmids ────────
  const mmids = (leadsPage ?? []).map(l => l.mmid)
  const { data: callsPage } = mmids.length > 0
    ? await supabase
        .from('telesales_calls')
        .select('mmid, call_status, agent, first_connected_date, reason_group')
        .in('mmid', mmids)
    : { data: [] }

  // ── 7. Merge: attach telesales_calls to each lead ─────────
  const callsMap = Object.fromEntries(
    (callsPage ?? []).map(c => [c.mmid, c])
  )
  const leads = (leadsPage ?? []).map(l => ({
    ...l,
    telesales_calls: callsMap[l.mmid] ?? null,
  }))

  return NextResponse.json({
    total:     total    ?? 0,
    called:    called   ?? 0,
    notCalled: (total ?? 0) - (called ?? 0),
    reached,
    callStatusCounts,
    tierBreakdown,
    leads,
    page,
    limit,
  })
}
