import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('upload_batches')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(50)
  return NextResponse.json(data ?? [])
}
