import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { queryCalls, querySalesOnline, MOCK_LEADS } from '@/lib/mock/data'

const USE_MOCK = process.env.USE_MOCK_DATA === 'true'

function buildTelesalesResponse(allCalls: { customer_id: string; call_date: string; call_status: string; agent_name: string; agent_company: string }[], leadCount: number, firstOrders: number) {
  const summary = {
    total_calls:    allCalls.length,
    contacted:      allCalls.filter(c => c.call_status === 'Contacted').length,
    no_answer:      allCalls.filter(c => c.call_status === 'No Answer').length,
    interested:     allCalls.filter(c => c.call_status === 'Interested').length,
    not_interested: allCalls.filter(c => c.call_status === 'Not Interested').length,
    ordered:        allCalls.filter(c => c.call_status === 'Ordered').length,
  }

  const agentMap = new Map<string, { agent_name: string; agent_company: string; total_calls: number; contacted: number; interested: number; ordered: number }>()
  for (const c of allCalls) {
    if (!agentMap.has(c.agent_name)) agentMap.set(c.agent_name, { agent_name: c.agent_name, agent_company: c.agent_company, total_calls: 0, contacted: 0, interested: 0, ordered: 0 })
    const a = agentMap.get(c.agent_name)!
    a.total_calls++
    if (c.call_status === 'Contacted')     a.contacted++
    if (c.call_status === 'Interested')    a.interested++
    if (c.call_status === 'Ordered')       a.ordered++
  }
  const by_agent = [...agentMap.values()].map(a => ({
    ...a,
    connection_rate: a.total_calls > 0 ? a.contacted / a.total_calls : 0,
    conversion_rate: a.contacted > 0 ? a.interested / a.contacted : 0,
  })).sort((a, b) => b.total_calls - a.total_calls)

  const dateMap = new Map<string, { date: string; total_calls: number; contacted: number }>()
  for (const c of allCalls) {
    if (!dateMap.has(c.call_date)) dateMap.set(c.call_date, { date: c.call_date, total_calls: 0, contacted: 0 })
    const d = dateMap.get(c.call_date)!
    d.total_calls++
    if (['Contacted','Interested','Not Interested','Ordered'].includes(c.call_status)) d.contacted++
  }
  const by_date = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  const contacted_total    = allCalls.filter(c => ['Contacted','Interested','Not Interested','Ordered'].includes(c.call_status)).length
  const interested_total   = allCalls.filter(c => ['Interested','Ordered'].includes(c.call_status)).length
  const not_interested_total = summary.not_interested
  const no_answer_total    = summary.no_answer
  const ordered_total      = summary.ordered
  const lc = leadCount || allCalls.length

  const sankey = {
    nodes: [
      { id: 'Lead List' }, { id: 'Called' }, { id: 'Contacted' }, { id: 'No Answer' },
      { id: 'Interested' }, { id: 'Not Interested' }, { id: 'Ordered' }, { id: 'First Purchase' },
    ].filter(n => {
      if (n.id === 'Lead List')       return lc > 0
      if (n.id === 'Called')          return allCalls.length > 0
      if (n.id === 'No Answer')       return no_answer_total > 0
      if (n.id === 'Contacted')       return contacted_total > 0
      if (n.id === 'Interested')      return interested_total > 0
      if (n.id === 'Not Interested')  return not_interested_total > 0
      if (n.id === 'Ordered')         return ordered_total > 0
      if (n.id === 'First Purchase')  return firstOrders > 0
      return true
    }),
    links: [
      lc > 0 && allCalls.length > 0         ? { source: 'Lead List',    target: 'Called',         value: Math.min(lc, allCalls.length) } : null,
      contacted_total > 0                   ? { source: 'Called',       target: 'Contacted',      value: contacted_total } : null,
      no_answer_total > 0                   ? { source: 'Called',       target: 'No Answer',      value: no_answer_total } : null,
      interested_total > 0                  ? { source: 'Contacted',    target: 'Interested',     value: interested_total } : null,
      not_interested_total > 0              ? { source: 'Contacted',    target: 'Not Interested', value: not_interested_total } : null,
      ordered_total > 0                     ? { source: 'Interested',   target: 'Ordered',        value: ordered_total } : null,
      firstOrders > 0 && ordered_total > 0  ? { source: 'Ordered',      target: 'First Purchase', value: Math.min(firstOrders, ordered_total) } : null,
    ].filter(Boolean),
  }

  return { summary, by_agent, by_date, sankey }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  if (USE_MOCK) {
    const allCalls   = queryCalls(from, to)
    const firstOrders = querySalesOnline(from, to).length
    const leadCount  = MOCK_LEADS.length
    return NextResponse.json(buildTelesalesResponse(allCalls, leadCount, firstOrders))
  }

  const supabase = createServiceClient()
  const { data: calls } = await supabase
    .from('telesales_calls')
    .select('customer_id, call_date, call_status, agent_name, agent_company')
    .gte('call_date', from).lte('call_date', to)

  const { data: leads } = await supabase.from('leads').select('customer_id')
  const { data: onlineOrders } = await supabase.from('sales_online').select('customer_id').gte('order_date', from).lte('order_date', to)

  return NextResponse.json(buildTelesalesResponse(calls ?? [], (leads ?? []).length, (onlineOrders ?? []).length))
}
