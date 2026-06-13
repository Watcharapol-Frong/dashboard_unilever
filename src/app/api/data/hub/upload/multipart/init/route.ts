import { NextResponse } from 'next/server'
import { CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2, R2_BUCKET } from '@/lib/r2'
import { FILE_TYPE_CONFIGS } from '@/lib/upload-config'
import type { UploadFileType } from '@/lib/upload-config'
import { randomUUID } from 'crypto'

const PART_SIZE = 10 * 1024 * 1024      // 10MB per part
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 // 10GB ceiling

export async function POST(request: Request) {
  const { type, fileSize } = await request.json() as { type: UploadFileType; fileSize: number }

  if (!type || !FILE_TYPE_CONFIGS[type])
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  if (!fileSize || fileSize <= 0 || fileSize > MAX_FILE_SIZE)
    return NextResponse.json({ error: 'Invalid fileSize' }, { status: 400 })

  const key = `tmp/${randomUUID()}.csv`
  const partCount = Math.ceil(fileSize / PART_SIZE)

  const { UploadId } = await r2.send(new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: 'text/csv',
  }))

  if (!UploadId)
    return NextResponse.json({ error: 'Failed to initiate multipart upload' }, { status: 500 })

  const presignedUrls = await Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(r2, new UploadPartCommand({
        Bucket: R2_BUCKET,
        Key: key,
        UploadId,
        PartNumber: i + 1,
      }), { expiresIn: 3600 })
    )
  )

  return NextResponse.json({ uploadId: UploadId, key, presignedUrls, partSize: PART_SIZE })
}
