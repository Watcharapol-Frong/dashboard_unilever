import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getPresignedUploadUrl } from '@/lib/storage/r2'
import { FILE_TYPE_CONFIGS } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'
import { withAdmin } from '@/lib/auth'

export async function POST(request: Request) {
  return withAdmin(async () => {
    const { type } = await request.json() as { type: UploadFileType }
    if (!type || !FILE_TYPE_CONFIGS[type])
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

    const key = `tmp/${randomUUID()}.csv`
    const url = await getPresignedUploadUrl(key)

    return NextResponse.json({ url, key })
  })
}
