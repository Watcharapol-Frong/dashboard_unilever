import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()

  // Fetch upload batches without the user_profiles join
  // (no direct FK between upload_batches.uploaded_by → user_profiles.user_id)
  const { data, error } = await supabase
    .from('upload_batches')
    .select('id, table_name, filename, storage_path, row_count, error_count, status, uploaded_at, uploaded_by')
    .order('uploaded_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[history] Supabase error:', error)
    return NextResponse.json([])
  }

  // TODO [AUTH]: once Auth is implemented, fetch user_profiles by uploaded_by uuid
  // and attach { email, full_name } to each row
  const rows = (data ?? []).map(b => ({
    ...b,
    user_profiles: null,
  }))

  return NextResponse.json(rows)
}
