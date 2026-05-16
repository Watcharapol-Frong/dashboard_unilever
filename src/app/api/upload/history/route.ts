import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query<{
      id: string; table_name: string; filename: string | null
      storage_path: string | null; row_count: number | null
      error_count: number; status: string; uploaded_at: string; uploaded_by: string | null
    }>(
      `SELECT id, table_name, filename, storage_path, row_count, error_count, status, uploaded_at, uploaded_by
       FROM upload_batches
       ORDER BY uploaded_at DESC
       LIMIT 50`
    )
    return NextResponse.json(rows.map(b => ({ ...b, user_profiles: null })))
  } catch (err) {
    console.error('[history] DB error:', err)
    return NextResponse.json([])
  }
}
