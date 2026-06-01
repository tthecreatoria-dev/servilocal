import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createPayPalOrder } from '@/lib/paypal'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await db.jobPost.findUnique({
    where: { id: jobId },
    select: { clientId: true, status: true, budget: true, payment: { select: { status: true } } },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (job.clientId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (job.payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }
  if (job.status !== 'PENDING_PAYMENT') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/['"]/g, '').trimEnd()
  const { orderId, approveUrl } = await createPayPalOrder(
    Number(job.budget).toFixed(2),
    jobId,
    `${appUrl}/api/payments/paypal/success?jobId=${jobId}`,
    `${appUrl}/dashboard/jobs/${jobId}/pay`,
  )

  await db.jobPayment.upsert({
    where: { jobPostId: jobId },
    create: { jobPostId: jobId, amount: job.budget, method: 'PAYPAL', status: 'PENDING', paypalOrderId: orderId },
    update: { paypalOrderId: orderId, status: 'PENDING' },
  })

  return NextResponse.redirect(approveUrl)
}
