import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { buildMartPerformance } from '@/lib/services/mart-service'

export const dynamic = 'force-dynamic'

export async function POST() {
  return withAdmin(async () => {
    const start = Date.now()
    try {
      const performance = await buildMartPerformance()
      return NextResponse.json({ ok: true, performance, duration_ms: Date.now() - start })
    } catch (err) {
      console.error('[refresh-mart/finalize]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
