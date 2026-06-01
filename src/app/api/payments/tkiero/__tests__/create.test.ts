import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.hoisted(() => vi.fn())
const mockJobPostFindUnique = vi.hoisted(() => vi.fn())
const mockJobPaymentUpsert = vi.hoisted(() => vi.fn())
const mockGetTkiero = vi.hoisted(() => vi.fn())
const mockCreatePayment = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    jobPost: { findUnique: mockJobPostFindUnique },
    jobPayment: { upsert: mockJobPaymentUpsert },
  },
}))
vi.mock('@/lib/tkiero', () => ({ getTkiero: mockGetTkiero }))

import { GET } from '@/app/api/payments/tkiero/create/route'

const clientSession = { user: { id: 'client-1', role: 'CLIENT' } }

function makeRequest(jobId: string) {
  return new NextRequest(`http://localhost/api/payments/tkiero/create?jobId=${jobId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTkiero.mockReturnValue({ createPayment: mockCreatePayment })
})

describe('GET /api/payments/tkiero/create', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when job not found', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when job belongs to another client', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'other', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    const res = await GET(makeRequest('job-1'))
    expect(res.status).toBe(403)
  })

  it('reuses existing pending Tkiero payment without calling API', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({
      clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00',
      payment: { status: 'PENDING', tkieroPaymentId: 'pay_existing', method: 'TKIERO' },
    })
    const res = await GET(makeRequest('job-1'))
    expect(mockCreatePayment).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toContain('pay_existing')
  })

  it('calls Tkiero API and redirects with new tkieroPaymentId on success', async () => {
    mockAuth.mockResolvedValueOnce(clientSession)
    mockJobPostFindUnique.mockResolvedValueOnce({ clientId: 'client-1', status: 'PENDING_PAYMENT', budget: '100.00', payment: null })
    mockCreatePayment.mockResolvedValueOnce({ id: 'pay_new', qrCodeUrl: 'https://qr.tkiero.io/pay_new' })
    mockJobPaymentUpsert.mockResolvedValueOnce({})

    const res = await GET(makeRequest('job-1'))

    expect(mockCreatePayment).toHaveBeenCalledWith(100, 'USD', { jobPostId: 'job-1', clientId: 'client-1' })
    expect(mockJobPaymentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tkieroPaymentId: 'pay_new', qrCodeUrl: 'https://qr.tkiero.io/pay_new' }),
    }))
    expect(res.headers.get('location')).toContain('pay_new')
  })
})
