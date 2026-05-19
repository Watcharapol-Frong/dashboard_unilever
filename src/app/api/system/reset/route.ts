import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { listR2Folder, deleteFromR2 } from '@/lib/storage/r2'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const errors: string[] = []

  // ── 1. Clear all tables ───────────────────────────────────
  const tables = ['online_sales','offline_sales','leads','products','telesales_calls','targets','costs','incentives','upload_batches']
  try {
    for (const t of tables) {
      // Use TRUNCATE for speed and to avoid lock memory limits
      await query(`TRUNCATE TABLE ${t} CASCADE`)
    }
    
    // Also reset the summary table if it exists
    try {
      await query(`TRUNCATE TABLE table_summaries`)
    } catch (e) {
      // ignore if table doesn't exist yet
    }
    
    console.log('[reset] all tables truncated')
  } catch (err) {
    errors.push(`DB clear: ${(err as Error).message}`)
    console.error('[reset] clear error:', err)
  }

  // ── 2. Clear R2 storage ───────────────────────────────────
  const folders = [
    'order_sales/online', 'order_sales/offline',
    'leads', 'leads-activity', 'products',
    'telesales', 'targets', 'costs', 'incentives',
  ]

  for (const folder of folders) {
    try {
      const keys = await listR2Folder(folder + '/')
      for (const key of keys) {
        await deleteFromR2(key)
      }
      if (keys.length > 0) console.log(`[reset] cleared R2: ${folder} (${keys.length} files)`)
    } catch (err) {
      errors.push(`R2 ${folder}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({
    ok:      errors.length === 0,
    errors:  errors.length > 0 ? errors : undefined,
    message: errors.length === 0 ? 'All data cleared' : 'Partial clear — check errors',
  })
}
