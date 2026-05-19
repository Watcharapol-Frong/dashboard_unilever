import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET() {
  try {
    const rows = await query(`SELECT * FROM targets ORDER BY month DESC`)
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { month, dynamic_cmg, sales_target, buying_target, contact_target } = body

  if (!month || !dynamic_cmg) {
    return NextResponse.json({ error: 'month and dynamic_cmg are required' }, { status: 400 })
  }

  try {
    const row = await queryOne(
      `INSERT INTO targets (month, dynamic_cmg, sales_target, buying_target, contact_target)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (month, dynamic_cmg) DO UPDATE SET
         sales_target   = EXCLUDED.sales_target,
         buying_target  = EXCLUDED.buying_target,
         contact_target = EXCLUDED.contact_target,
         updated_at     = NOW()
       RETURNING *`,
      [month, dynamic_cmg,
       sales_target   != null ? Number(sales_target)   : null,
       buying_target  != null ? Number(buying_target)  : null,
       contact_target != null ? Number(contact_target) : null]
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month       = searchParams.get('month')
  const dynamic_cmg = searchParams.get('dynamic_cmg')

  if (!month || !dynamic_cmg) {
    return NextResponse.json({ error: 'month and dynamic_cmg are required' }, { status: 400 })
  }

  try {
    await query(
      `DELETE FROM targets WHERE month = $1 AND dynamic_cmg = $2`,
      [month, dynamic_cmg]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
