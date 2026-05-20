import { NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { withAdmin } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_CHUNKS = 500 // ~1.5 GB ceiling at 3 MB per chunk

export async function POST(request: Request) {
  return withAdmin(async () => {
    const formData = await request.formData()
    const chunk    = formData.get('chunk') as File | null
    const uploadId = formData.get('uploadId') as string | null
    const index    = formData.get('index') as string | null
    const total    = formData.get('total') as string | null

    if (!chunk || !uploadId || index === null)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    if (!UUID_RE.test(uploadId))
      return NextResponse.json({ error: 'Invalid uploadId' }, { status: 400 })

    const idx = parseInt(index, 10)
    const tot = total ? parseInt(total, 10) : MAX_CHUNKS
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CHUNKS)
      return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 })
    if (tot > MAX_CHUNKS)
      return NextResponse.json({ error: `File too large (max ${MAX_CHUNKS} chunks)` }, { status: 400 })

    const paddedIndex = String(idx).padStart(5, '0')
    const buffer = Buffer.from(await chunk.arrayBuffer())
    await uploadToR2(`tmp/${uploadId}/${paddedIndex}.chunk`, buffer)

    return NextResponse.json({ ok: true })
  })
}
