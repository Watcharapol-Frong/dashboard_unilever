import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { r2, R2_BUCKET, uploadToR2 } from '@/lib/r2'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Resend } from 'resend'

const TYPE_LABELS: Record<string, string> = {
  bug:     '🔴 Bug Report',
  feature: '💡 Feature Request',
  other:   '❓ Other',
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withAuth(async () => {
    const formData    = await req.formData()
    const type        = (formData.get('type')        as string) ?? 'other'
    const title       = (formData.get('title')       as string) ?? ''
    const description = (formData.get('description') as string) ?? ''
    const page        = (formData.get('page')        as string) ?? ''
    const reporter    = (formData.get('reporter')    as string) ?? 'Unknown'
    const imageFile   = formData.get('image') as File | null

    let imageHtml = ''

    if (imageFile && imageFile.size > 0) {
      const buffer   = Buffer.from(await imageFile.arrayBuffer())
      const now      = new Date()
      const month    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const safeName = imageFile.name.replace(/[^a-z0-9._-]/gi, '_')
      const key      = `feedback/${month}/${Date.now()}-${safeName}`

      await uploadToR2(key, buffer, imageFile.type || 'image/png')

      const url = await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        { expiresIn: 60 * 60 * 24 * 30 },
      )

      imageHtml = `
        <p style="margin-top:16px">
          <strong>Screenshot:</strong><br/>
          <a href="${url}" style="color:#003DA6">View screenshot</a>
          <span style="color:#888;font-size:12px"> (link valid for 30 days)</span>
        </p>
        <p style="margin-top:8px">
          <img src="${url}" alt="screenshot" style="max-width:600px;border-radius:6px;border:1px solid #e5e7eb"/>
        </p>`
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('[feedback] RESEND_API_KEY is not set')
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { error: resendError } = await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
      to:      'wcharoens@cpaxtra.co.th',
      subject: `[Dashboard] ${TYPE_LABELS[type] ?? type}: ${title}`,
      html: `
        <div style="font-family:sans-serif;max-width:640px">
          <h2 style="color:#003DA6;margin-bottom:4px">${TYPE_LABELS[type] ?? type}</h2>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
            <tr><td style="padding:4px 12px 4px 0;color:#888;white-space:nowrap">Reporter</td><td style="padding:4px 0"><strong>${reporter}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;white-space:nowrap">Page</td><td style="padding:4px 0">${page}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;white-space:nowrap">Title</td><td style="padding:4px 0"><strong>${title}</strong></td></tr>
          </table>
          <h3 style="margin-bottom:8px">Description</h3>
          <p style="background:#f9fafb;padding:12px;border-radius:6px;white-space:pre-wrap">${description}</p>
          ${imageHtml}
          <hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/>
          <p style="color:#888;font-size:12px">Sent from Makro × Unilever HOC Telesales Dashboard</p>
        </div>`,
    })

    if (resendError) {
      console.error('[feedback] Resend error:', resendError)
      return NextResponse.json({ error: resendError.message }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  })
}
