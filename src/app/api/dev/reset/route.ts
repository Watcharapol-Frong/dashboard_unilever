/**
 * DEV ONLY — Wipe all Silver tables + Storage bucket
 * DELETE /api/dev/reset
 *
 * Requires this function in Supabase SQL Editor (run once):
 *
 * CREATE OR REPLACE FUNCTION reset_all_data()
 * RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
 * BEGIN
 *   TRUNCATE online_sales, offline_sales, leads, products,
 *            telesales_calls, targets, costs, incentives,
 *            upload_batches CASCADE;
 * END;
 * $$;
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const errors: string[] = []

  // ── 1. Truncate all Silver tables via DB function ─────────────────────────
  const { error: truncateError } = await supabase.rpc('reset_all_data')
  if (truncateError) {
    errors.push(`DB truncate: ${truncateError.message}`)
    console.error('[reset] truncate error:', truncateError)
  } else {
    console.log('[reset] all Silver tables truncated')
  }

  // ── 2. Clear Storage bucket ───────────────────────────────────────────────
  const BUCKET = 'csv-uploads'
  const folders = [
    'order_sales/online',
    'order_sales/offline',
    'leads',
    'products',
    'telesales',
    'targets',
    'costs',
    'incentives',
  ]

  for (const folder of folders) {
    const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 })
    if (files && files.length > 0) {
      const paths = files.map(f => `${folder}/${f.name}`)
      const { error } = await supabase.storage.from(BUCKET).remove(paths)
      if (error) errors.push(`Storage ${folder}: ${error.message}`)
      else console.log(`[reset] cleared storage: ${folder} (${files.length} files)`)
    }
  }

  return NextResponse.json({
    ok:      errors.length === 0,
    errors:  errors.length > 0 ? errors : undefined,
    message: errors.length === 0 ? 'All data cleared' : 'Partial clear — check errors',
  })
}
