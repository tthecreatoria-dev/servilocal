import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'node:crypto'

const mockTransactionUpdateMany = vi.hoisted(() => vi.fn())
const mockJobPaymentFindFirst = vi.hoisted(() => vi.fn())
const mockPrismaTransaction = vi.hoisted(() => vi.fn())
const mockJobPaymentUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockJobPostUpdate = vi.hoisted(() => vi.fn().mockReturnValue({}))

vi.mock('@/lib/db', () => ({
  db: {
    transaction: { updateMany: mockTransactionUpdateMany },
    jobPayment: { findFirst: mockJobPaymentFindFirst, update: mockJobPaymentUpdate },
    jobPost: { update: mockJobPostUpdate },
    $transaction: mockPrismaTransaction,
  },
}))

import { POST } from '@/app/api/payments/webhook/route'

const SECRET = 'test-webhook-secret'

function makeSignedRequest(body: object) {
  const raw = JSON.stringify(body)
  const sig = crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
  return new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'x-tkiero-signature': sig, 'content-type': 'application/json' },
    body: raw,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TKIERO_WEBHOOK_SECRET = SECRET
})

const jobPaymentConfirmed = {
  event: 'payment.confirmed',
  paymentId: 'pay_123',
  amount: 100,
  metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
  timestamp: '2026-05-28T00:00:00Z',
}

const serviceRequestConfirmed = {
  event: 'payment.confirmed',
  paymentId: 'pay_456',
  amount: 100,
  metadata: { serviceRequestId: 'req_1', clientId: 'usr_1', providerId: 'usr_2', category: 'DELIVERY' },
  timestamp: '2026-05-28T00:00:00Z',
}

describe('POST /api/payments/webhook', () => {
  it('returns 401 for invalid signature', async () => {
    const req = new NextRequest('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-tkiero-signature': 'badhex00', 'content-type': 'application/json' },
      body: JSON.stringify(jobPaymentConfirmed),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('updates JobPayment and JobPost for payment.confirmed with jobPostId', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce({ id: 'jp_1', jobPostId: 'job_1', status: 'PENDING' })
    mockPrismaTransaction.mockResolvedValueOnce([{}, {}])

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ])
    expect(mockTransactionUpdateMany).not.toHaveBeenCalled()
  })

  it('returns 200 without DB writes when JobPayment is already HELD (idempotent)', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce({ id: 'jp_1', jobPostId: 'job_1', status: 'HELD' })

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('returns 200 without DB writes when JobPayment not found (logs error)', async () => {
    mockJobPaymentFindFirst.mockResolvedValueOnce(null)

    const res = await POST(makeSignedRequest(jobPaymentConfirmed))

    expect(res.status).toBe(200)
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('updates Transaction for payment.confirmed with serviceRequestId (existing flow)', async () => {
    mockTransactionUpdateMany.mockResolvedValueOnce({ count: 1 })

    const res = await POST(makeSignedRequest(serviceRequestConfirmed))

    expect(res.status).toBe(200)
    expect(mockTransactionUpdateMany).toHaveBeenCalledWith({
      where: { serviceRequestId: 'req_1', status: 'PENDING' },
      data: { status: 'HELD', tkieroPaymentId: 'pay_456' },
    })
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })
})
