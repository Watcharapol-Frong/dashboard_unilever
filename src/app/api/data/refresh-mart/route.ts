import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { refreshAllMarts } from '@/lib/services/mart-service'
import { buildLock } from '@/lib/build-lock'

export async function POST(request: Request) {
  return withAdmin(async () => {
    const body = await request.json().catch(() => ({}))
    const attributionDays = Math.max(1, Math.min(365, Number(body.attribution_days ?? 14)))

    if (!buildLock.acquire(attributionDays)) {
      return NextResponse.json(
        { error: 'Build already in progress', ...buildLock.get() },
        { status: 409 }
      )
    }

    try {
      const result = await refreshAllMarts(attributionDays)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      console.error('[refresh-mart]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    } finally {
      buildLock.release()
    }
  })
}
