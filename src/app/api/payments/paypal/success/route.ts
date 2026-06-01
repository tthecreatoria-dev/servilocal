import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { capturePayPalOrder } from '@/lib/paypal'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = req.nextUrl.searchParams.get('jobId')
  const token = req.nextUrl.searchParams.get('token')

  if (!jobId || !token) {
    return NextResponse.redirect(new URL('/dashboard/jobs', req.url))
  }

  const payment = await db.jobPayment.findUnique({
    where: { jobPostId: jobId },
    select: { status: true },
  })

  if (payment?.status === 'HELD') {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}?paid=1`, req.url))
  }

  try {
    const capture = await capturePayPalOrder(token)
    const captureStatus = capture.purchase_units[0]?.payments.captures[0]?.status
    if (captureStatus !== 'COMPLETED') {
      return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}/pay?error=paypal_failed`, req.url))
    }
  } catch {
    return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}/pay?error=paypal_failed`, req.url))
  }

  await db.$transaction([
    db.jobPayment.update({ where: { jobPostId: jobId }, data: { status: 'HELD' } }),
    db.jobPost.update({ where: { id: jobId }, data: { status: 'OPEN' } }),
  ])

  return NextResponse.redirect(new URL(`/dashboard/jobs/${jobId}?paid=1`, req.url))
}
