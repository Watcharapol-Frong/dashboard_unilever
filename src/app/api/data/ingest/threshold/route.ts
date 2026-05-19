import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'

function isAuthorized(request: NextRequest) {
  const auth = request.headers.get('Authorization') ?? ''
  return auth === `Bearer ${process.env.INGEST_API_SECRET}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const row = await queryOne<{ latest: string | null }>(
    `SELECT MAX(first_connected_date)::text AS latest FROM telesales_calls`
  )

  return NextResponse.json({ date: row?.latest ?? null })
}
