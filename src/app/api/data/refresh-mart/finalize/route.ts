import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { buildMartCostIncentive } from '@/lib/services/mart-service'

export async function POST() {
  return withAdmin(async () => {
    const start = Date.now()
    try {
      const cost_incentive = await buildMartCostIncentive()
      return NextResponse.json({ ok: true, cost_incentive, duration_ms: Date.now() - start })
    } catch (err) {
      console.error('[refresh-mart/finalize]', err)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  })
}
