// src/app/api/payments/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { TkieroWebhookSchema } from '@/types/schemas'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TKIERO_WEBHOOK_SECRET
  if (!secret) {
    console.error('TKIERO_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const rawBody = await req.text()
  // TODO: confirm header name with Tkiero team — may differ from 'x-tkiero-signature'
  const signature = req.headers.get('x-tkiero-signature') ?? ''

  let isValid: boolean
  try {
    isValid = verifySignature(rawBody, signature, secret)
  } catch {
    // timingSafeEqual throws if buffers have different length (malformed hex)
    isValid = false
  }

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = TkieroWebhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const { event, paymentId, metadata } = parsed.data

  try {
    if (event === 'payment.confirmed') {
      if ('jobPostId' in metadata && metadata.jobPostId) {
        const jobPayment = await db.jobPayment.findFirst({ where: { tkieroPaymentId: paymentId } })
        if (!jobPayment) {
          console.error(`JobPayment not found for tkieroPaymentId: ${paymentId}`)
          return NextResponse.json({ received: true })
        }
        if (jobPayment.status === 'HELD') {
          return NextResponse.json({ received: true })
        }
        await db.$transaction([
          db.jobPayment.update({ where: { id: jobPayment.id }, data: { status: 'HELD' } }),
          db.jobPost.update({ where: { id: jobPayment.jobPostId }, data: { status: 'OPEN' } }),
        ])
      } else if ('serviceRequestId' in metadata && metadata.serviceRequestId) {
        await db.transaction.updateMany({
          where: { serviceRequestId: metadata.serviceRequestId, status: 'PENDING' },
          data: { status: 'HELD', tkieroPaymentId: paymentId },
        })
      }
    } else if (event === 'payment.failed') {
      if ('serviceRequestId' in metadata && metadata.serviceRequestId) {
        await db.transaction.updateMany({
          where: { serviceRequestId: metadata.serviceRequestId, status: 'PENDING' },
          data: { status: 'REFUNDED' },
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook DB update failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
