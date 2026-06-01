import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockJobPaymentFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockJobPostUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockTransaction = vi.hoisted(() => vi.fn())
const mockCapturePayPalOrder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    jobPayment: { findUnique: mockJobPaymentFindUnique, update: mockJobPaymentUpdate },
    jobPost: { update: mockJobPostUpdate },
    $transaction: mockTransaction,
  },
}))
vi.mock('@/lib/paypal', () => ({ capturePayPalOrder: mockCapturePayPalOrder }))

import { GET } from '@/app/api/payments/paypal/success/route'

function makeRequest(jobId: string, token: string) {
  return new NextRequest(`http://localhost/api/payments/paypal/success?jobId=${jobId}&token=${token}`)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/payments/paypal/success', () => {
  it('redirects to /dashboard/jobs when jobId or token is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/payments/paypal/success'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard/jobs')
  })

  it('redirects to success when payment already HELD (idempotent)', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'HELD' })
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paid=1')
    expect(mockCapturePayPalOrder).not.toHaveBeenCalled()
  })

  it('redirects to pay page with error when capture status is not COMPLETED', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockResolvedValueOnce({
      id: 'ORDER_1',
      status: 'VOIDED',
      purchase_units: [{ payments: { captures: [{ id: 'c1', status: 'DECLINED', amount: {} }] } }],
    })
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paypal_failed')
  })

  it('redirects to pay page with error when capture throws', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockRejectedValueOnce(new Error('PayPal API down'))
    const res = await GET(makeRequest('job-1', 'ORDER_1'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paypal_failed')
  })

  it('runs atomic DB update and redirects to success on completed capture', async () => {
    mockJobPaymentFindUnique.mockResolvedValueOnce({ status: 'PENDING' })
    mockCapturePayPalOrder.mockResolvedValueOnce({
      id: 'ORDER_1',
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'c1', status: 'COMPLETED', amount: {} }] } }],
    })
    mockTransaction.mockResolvedValueOnce([{}, {}])

    const res = await GET(makeRequest('job-1', 'ORDER_1'))

    expect(mockTransaction).toHaveBeenCalledWith(expect.arrayContaining([
      expect.anything(),
      expect.anything(),
    ]))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('paid=1')
  })
})
