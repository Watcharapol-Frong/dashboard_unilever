import { NextResponse } from 'next/server'
import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '@/lib/r2'
import { withAdmin } from '@/lib/auth'

const KEY_RE = /^tmp\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/i

export async function POST(request: Request) {
  return withAdmin(async () => {
  const { uploadId, key } = await request.json() as { uploadId: string; key: string }

  if (!uploadId || !key)
    return NextResponse.json({ error: 'Missing uploadId or key' }, { status: 400 })
  if (!KEY_RE.test(key))
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  try {
    await r2.send(new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
    }))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[multipart/abort]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
  }) // withAdmin
}
