/**
 * Run once to set CORS policy on R2 bucket via S3 API.
 * Usage: node scripts/set-r2-cors.mjs
 * Requires .env.local to be present with R2 credentials.
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env.local
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

const BUCKET = env.R2_BUCKET_NAME ?? 'dashboard-unilever'
const ORIGIN = env.NEXT_PUBLIC_APP_URL ?? 'https://dashboard-unilever.vercel.app'

console.log(`Setting CORS on bucket: ${BUCKET}`)
console.log(`Allowed origin: ${ORIGIN}`)

await r2.send(new PutBucketCorsCommand({
  Bucket: BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: [ORIGIN, 'http://localhost:3000'],
        AllowedMethods: ['PUT'],
        AllowedHeaders: ['Content-Type'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
}))

console.log('✓ CORS policy set')

// Verify
const result = await r2.send(new GetBucketCorsCommand({ Bucket: BUCKET }))
console.log('Current CORS policy:')
console.log(JSON.stringify(result.CORSRules, null, 2))
