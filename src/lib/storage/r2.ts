import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'dashboard-unilever'

export async function uploadToR2(key: string, body: Buffer | Uint8Array, contentType = 'application/octet-stream') {
  await r2.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }))
}

export async function deleteFromR2(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

export async function listR2Folder(prefix: string): Promise<string[]> {
  const res = await r2.send(new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: prefix,
    MaxKeys: 1000,
  }))
  return (res.Contents ?? []).map(o => o.Key!).filter(Boolean)
}
