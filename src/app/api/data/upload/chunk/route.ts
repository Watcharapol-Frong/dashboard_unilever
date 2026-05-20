import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionClaims?.publicMetadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const chunk = formData.get('chunk') as File | null
  const uploadId = formData.get('uploadId') as string | null
  const index = formData.get('index') as string | null

  if (!chunk || !uploadId || index === null)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const buffer = Buffer.from(await chunk.arrayBuffer())
  const paddedIndex = String(index).padStart(5, '0')
  await uploadToR2(`tmp/${uploadId}/${paddedIndex}.chunk`, buffer)

  return NextResponse.json({ ok: true })
}
