import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

export async function POST() {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  const bucket = process.env.R2_BUCKET_NAME ?? 'dashboard-unilever'
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? ''

  await r2.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: [origin],
        AllowedMethods: ['PUT'],
        AllowedHeaders: ['Content-Type'],
        MaxAgeSeconds: 3600,
      }],
    },
  }))

  const result = await r2.send(new GetBucketCorsCommand({ Bucket: bucket }))
  return NextResponse.json({ ok: true, corsRules: result.CORSRules })
}
