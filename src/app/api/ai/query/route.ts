import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withAuth(async () => {
    const body = await req.json().catch(() => null)
    const sql: unknown = body?.sql

    if (typeof sql !== 'string' || !sql.trim()) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid sql field' }, { status: 400 })
    }

    if (FORBIDDEN_KEYWORDS.test(sql)) {
      return NextResponse.json(
        { ok: false, error: 'Only SELECT queries are allowed' },
        { status: 400 }
      )
    }

    try {
      const wrapped = `SELECT * FROM (${sql}) AS _q LIMIT 500`
      const rows = await query<Record<string, unknown>>(wrapped)
      return NextResponse.json({ ok: true, rows, rowCount: rows.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database error'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  })
}
