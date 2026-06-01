import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.hoisted(() => vi.fn())
const mockJobPostFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpsert = vi.hoisted(() => vi.fn())
const mockCreatePayPalOrder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    jobPost: { findUnique: mockJobPostFindUnique },
    jobPayment: { upsert: mockJobPaymentUpsert },
  },
}))
vi.mock('@/lib/paypal', () => ({ createPayPalOrder: mockCreatePayPalOrder }))

import { GET } from '@/app/api/payments/paypal/create-order/route'

const clientSession = { user: { id: 'client-1', role: 'CLIENT' } }

function makeRequest(jobId: string) {
  return new NextRequest(`http://localhost/api/payments/paypal/create-order?jobId=${jobId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

describe('GET /api/payments/paypal/create-order', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when jobId is missing', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    const req = new NextRequest('http://localhost/api/payments/paypal/create-order')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when job not found', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when job belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'other-client', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(403)
  })

  it('redirects to PayPal approve URL on success', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    mockCreatePayPalOrder.mockResolvedValueOnce({ orderId: 'ORDER_1', approveUrl: 'https://paypal.com/approve/ORDER_1' })
    mockJobPaymentUpsert.mockResolvedValueOnce({})

    const res = await GET(makeRequest('job-1'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://paypal.com/approve/ORDER_1')
    expect(mockJobPaymentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobPostId: 'job-1' },
      create: expect.objectContaining({ method: 'PAYPAL', status: 'PENDING', paypalOrderId: 'ORDER_1' }),
    }))
  })

  it('redirects to dashboard when job payment is already HELD', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'OPEN', budget: '100.00', payment: { status: 'HELD' } })

    const res = await GET(makeRequest('job-1'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard/jobs/job-1')
    expect(mockCreatePayPalOrder).not.toHaveBeenCalled()
  })

  it('redirects to dashboard when job status is not PENDING_PAYMENT', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'COMPLETED', budget: '100.00', payment: null })

    const res = await GET(makeRequest('job-1'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard/jobs/job-1')
    expect(mockCreatePayPalOrder).not.toHaveBeenCalled()
  })
})
