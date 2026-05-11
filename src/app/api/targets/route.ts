import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .order('month', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// UPSERT a single target row (PK: month + dynamic_cmg)
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json()

  const row = {
    month:          body.month,
    dynamic_cmg:    body.dynamic_cmg,
    sales_target:   body.sales_target   != null ? Number(body.sales_target)   : null,
    buying_target:  body.buying_target  != null ? Number(body.buying_target)  : null,
    contact_target: body.contact_target != null ? Number(body.contact_target) : null,
  }

  if (!row.month || !row.dynamic_cmg) {
    return NextResponse.json({ error: 'month and dynamic_cmg are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('targets')
    .upsert(row, { onConflict: 'month,dynamic_cmg' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// Delete by ?month=YYYY-MM-01&dynamic_cmg=CMG_NAME
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)
  const month       = searchParams.get('month')
  const dynamic_cmg = searchParams.get('dynamic_cmg')

  if (!month || !dynamic_cmg) {
    return NextResponse.json({ error: 'month and dynamic_cmg are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('targets')
    .delete()
    .eq('month', month)
    .eq('dynamic_cmg', dynamic_cmg)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
