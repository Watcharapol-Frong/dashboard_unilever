import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getPresignedUploadUrl } from '@/lib/storage/r2'
import { FILE_TYPE_CONFIGS } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionClaims?.publicMetadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type } = await request.json() as { type: UploadFileType }
  if (!type || !FILE_TYPE_CONFIGS[type])
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const key = `tmp/${randomUUID()}.csv`
  const url = await getPresignedUploadUrl(key)

  return NextResponse.json({ url, key })
}
