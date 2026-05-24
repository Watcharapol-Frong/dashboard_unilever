import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { refreshMartChunk } from '@/lib/services/mart-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await request.json().catch(() => ({}))
    const offset          = Number(body.offset ?? 0)
    const limit           = Number(body.limit ?? 200)
    const attributionDays = Number(body.attribution_days ?? 14)
    const truncate        = Boolean(body.truncate ?? false)

    if (limit < 1 || limit > 1000)
      return NextResponse.json({ error: 'limit must be 1–1000' }, { status: 400 })

    try {
      const result = await refreshMartChunk(offset, limit, attributionDays, truncate)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      console.error('[refresh-mart/chunk]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
