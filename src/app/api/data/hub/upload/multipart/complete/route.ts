import { NextResponse } from 'next/server'
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3'
import { currentUser } from '@clerk/nextjs/server'
import { r2, R2_BUCKET } from '@/lib/r2'
import { FILE_TYPE_CONFIGS } from '@/lib/upload-config'
import type { UploadFileType } from '@/lib/upload-config'
import { processUploadFromKey } from '@/lib/upload-service'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { triggerMartBuildWorkflow } from '@/lib/build-trigger'

// Types that don't feed the mart build (buildMartMain/buildMartPerformance never
// read from them) — skip the auto-trigger for these to avoid a wasted rebuild.
const MART_UNRELATED_TYPES: UploadFileType[] = ['leads']

const KEY_RE = /^tmp\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/i

interface CompletedPart { PartNumber: number; ETag: string }

export async function POST(request: Request) {
  return withAdmin(async () => {
  const { uploadId, key, parts, type, filename } =
    await request.json() as {
      uploadId: string
      key: string
      parts: CompletedPart[]
      type: UploadFileType
      filename: string
    }

  if (!uploadId || !key || !parts?.length || !type || !filename)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (!KEY_RE.test(key))
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  if (!FILE_TYPE_CONFIGS[type])
    return NextResponse.json({ error: 'Unknown file type' }, { status: 400 })

  const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber)
  for (const p of sorted) {
    if (!Number.isInteger(p.PartNumber) || p.PartNumber < 1 || p.PartNumber > 10000)
      return NextResponse.json({ error: `Invalid PartNumber: ${p.PartNumber}` }, { status: 400 })
    if (!p.ETag || typeof p.ETag !== 'string')
      return NextResponse.json({ error: `Missing ETag for part ${p.PartNumber}` }, { status: 400 })
  }

  try {
    await r2.send(new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: sorted },
    }))
  } catch (err) {
    console.error('[multipart/complete] CompleteMultipartUpload failed:', err)
    return NextResponse.json({ error: 'Failed to assemble upload' }, { status: 500 })
  }

  const user = await currentUser()
  const uploadedBy = user?.primaryEmailAddress?.emailAddress
    ?? user?.fullName
    ?? user?.id
    ?? undefined

  try {
    const result = await processUploadFromKey(type, key, filename, uploadedBy)
    if (!result.ok) {
      const isClientError = result.error?.includes('CSV') ||
                            result.error?.includes('Header') ||
                            result.error?.includes('empty')
      return NextResponse.json(
        { error: result.error, details: result.errors, row_count: result.row_count, error_count: result.error_count },
        { status: isClientError ? 422 : 500 }
      )
    }

    // Auto-trigger a mart rebuild so sales_hoc_orders / mart_performance_cmg /
    // mart_telesales_funnel / table_summaries pick up this upload without
    // waiting for someone to click "Build Mart". Non-fatal — the upload already succeeded.
    if (!MART_UNRELATED_TYPES.includes(type)) {
      try {
        const lastBuild = await queryOne<{ attribution_days: number | null }>(
          `SELECT attribution_days FROM mart_builds ORDER BY id DESC LIMIT 1`
        )
        await triggerMartBuildWorkflow(lastBuild?.attribution_days ?? 30)
      } catch (err) {
        console.error('[multipart/complete] auto-trigger build failed (non-fatal):', err)
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[multipart/complete] processUploadFromKey failed:', err)
    return NextResponse.json({ error: (err as Error).message || 'Processing failed' }, { status: 500 })
  }
  }) // withAdmin
}
