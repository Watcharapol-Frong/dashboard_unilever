import { NextResponse } from 'next/server'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'
import { withAdmin } from '@/lib/auth'

export async function POST() {
  return withAdmin(async () => {
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

    try {
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
    } catch (err) {
      console.error('[set-r2-cors]', err)
      return NextResponse.json({ error: 'Failed to set CORS policy' }, { status: 500 })
    }
  })
}
