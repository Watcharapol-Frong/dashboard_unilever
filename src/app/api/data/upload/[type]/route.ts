import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { processUploadFromKey } from '@/lib/services/upload-service'
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
    const { key, filename } = await request.json() as { key: string; filename: string }
    if (!key || !filename)
      return NextResponse.json({ error: 'key and filename are required' }, { status: 400 })

    const result = await processUploadFromKey(type, key, filename)

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
