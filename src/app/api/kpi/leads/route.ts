import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('customer_id, customer_name, mobile, segment, assigned_company, assigned_date, status')
    .order('assigned_date', { ascending: false })

  const allLeads = leads ?? []
  const statusCounts = {
    pending: allLeads.filter(l => l.status === 'pending').length,
    called: allLeads.filter(l => l.status === 'called').length,
    converted: allLeads.filter(l => l.status === 'converted').length,
    lost: allLeads.filter(l => l.status === 'lost').length,
  }

  return NextResponse.json({ leads: allLeads, statusCounts, total: allLeads.length })
}
