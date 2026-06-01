import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getTkiero } from '@/lib/tkiero'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const job = await db.jobPost.findUnique({
    where: { id: jobId },
    select: {
      clientId: true,
      status: true,
      budget: true,
      payment: { select: { status: true, tkieroPaymentId: true, method: true } },
    },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (job.clientId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (job.payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }
  if (job.status !== 'PENDING_PAYMENT') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}`, req.url))
  }

  // Reuse existing pending Tkiero payment — avoids creating duplicate payments
  if (job.payment?.method === 'TKIERO' && job.payment.tkieroPaymentId) {
    return NextResponse.redirect(
      new URL(`/dashboard/jobs/${jobId}/pay?tkieroPaymentId=${job.payment.tkieroPaymentId}`, req.url),
    )
  }

  const tkieroPayment = await getTkiero().createPayment(Number(job.budget), 'USD', {
    jobPostId: jobId,
    clientId: session.user.id,
  })

  await db.jobPayment.upsert({
    where: { jobPostId: jobId },
    create: {
      jobPostId: jobId,
      amount: job.budget,
      method: 'TKIERO',
      status: 'PENDING',
      tkieroPaymentId: tkieroPayment.id,
      qrCodeUrl: tkieroPayment.qrCodeUrl ?? null,
    },
    update: {
      method: 'TKIERO',
      status: 'PENDING',
      tkieroPaymentId: tkieroPayment.id,
      qrCodeUrl: tkieroPayment.qrCodeUrl ?? null,
    },
  })

  return NextResponse.redirect(
    new URL(`/dashboard/jobs/${jobId}/pay?tkieroPaymentId=${tkieroPayment.id}`, req.url),
  )
}
