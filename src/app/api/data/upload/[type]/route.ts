import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { processUploadFromKey, processUploadFromChunks } from '@/lib/services/upload-service'
import { FILE_TYPE_CONFIGS } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'

export async function POST(
  request: NextRequest,
  { params }: { params: { type: string } },
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionClaims?.publicMetadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const type = params.type as UploadFileType
  if (!FILE_TYPE_CONFIGS[type])
    return NextResponse.json({ error: 'Unknown file type' }, { status: 400 })

  try {
    const { key, uploadId, filename } = await request.json() as { key?: string; uploadId?: string; filename: string }
    if (!filename || (!key && !uploadId))
      return NextResponse.json({ error: 'filename and either key or uploadId are required' }, { status: 400 })

    const result = uploadId
      ? await processUploadFromChunks(type, uploadId, filename)
      : await processUploadFromKey(type, key!, filename)

    if (!result.ok) {
      const isClientError = result.error?.includes('CSV') ||
                            result.error?.includes('Header') ||
                            result.error?.includes('empty')
      return NextResponse.json(
        { error: result.error, details: result.errors, row_count: result.row_count, error_count: result.error_count },
        { status: isClientError ? 422 : 500 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/upload/${type}] Unhandled error:`, err)
    return NextResponse.json(
      { error: (err as Error).message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
