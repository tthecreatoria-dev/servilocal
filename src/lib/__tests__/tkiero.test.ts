// src/lib/__tests__/tkiero.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { TkieroClient, TkieroApiError } from '@/lib/tkiero'

const mockHttp = {
  post: vi.fn(),
  get: vi.fn(),
} as unknown as AxiosInstance

describe('TkieroClient', () => {
  let client: TkieroClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new TkieroClient('test-key', 'https://api.tkiero.test', mockHttp)
  })

  describe('createPayment', () => {
    it('posts to /payments and returns the created payment', async () => {
      const mockPayment = {
        id: 'pay_123',
        amount: 100,
        currency: 'USD',
        status: 'PENDING',
        metadata: {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        },
        createdAt: '2026-05-25T00:00:00Z',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockPayment })

      const result = await client.createPayment(100, 'USD', {
        serviceRequestId: 'req_1',
        clientId: 'usr_1',
        providerId: 'usr_2',
        category: 'DELIVERY',
      })

      expect(mockHttp.post).toHaveBeenCalledWith('/payments', {
        amount: 100,
        currency: 'USD',
        metadata: {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        },
      })
      expect(result.id).toBe('pay_123')
    })

    it('accepts jobPost metadata', async () => {
      const mockPayment = {
        id: 'pay_456',
        amount: 200,
        currency: 'USD',
        status: 'PENDING',
        metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
        createdAt: '2026-05-28T00:00:00Z',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockPayment })

      const result = await client.createPayment(200, 'USD', {
        jobPostId: 'job_1',
        clientId: 'usr_1',
      })

      expect(mockHttp.post).toHaveBeenCalledWith('/payments', {
        amount: 200,
        currency: 'USD',
        metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
      })
      expect(result.id).toBe('pay_456')
    })

    it('throws TkieroApiError when the API returns an error', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: { code: 'INVALID_AMOUNT', message: 'Amount too low' } },
      }
      vi.mocked(mockHttp.post).mockRejectedValueOnce(axiosError)

      await expect(
        client.createPayment(0, 'USD', {
          serviceRequestId: 'req_1',
          clientId: 'usr_1',
          providerId: 'usr_2',
          category: 'DELIVERY',
        }),
      ).rejects.toThrow(TkieroApiError)
    })
  })

  describe('verifyPayment', () => {
    it('gets /payments/:id and returns the payment', async () => {
      const mockPayment = { id: 'pay_123', status: 'CONFIRMED' }
      vi.mocked(mockHttp.get).mockResolvedValueOnce({ data: mockPayment })

      const result = await client.verifyPayment('pay_123')

      expect(mockHttp.get).toHaveBeenCalledWith('/payments/pay_123')
      expect(result.id).toBe('pay_123')
    })
  })

  describe('releaseToProvider', () => {
    it('posts to /payments/:id/release and returns the result', async () => {
      const mockResult = {
        success: true,
        transactionId: 'txn_1',
        amount: 85,
        providerId: 'usr_2',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockResult })

      const result = await client.releaseToProvider('pay_123', 'usr_2', 85)

      expect(mockHttp.post).toHaveBeenCalledWith('/payments/pay_123/release', {
        providerId: 'usr_2',
        amount: 85,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('refund', () => {
    it('posts to /payments/:id/refund and returns the result', async () => {
      const mockResult = {
        success: true,
        refundId: 'ref_1',
        originalPaymentId: 'pay_123',
      }
      vi.mocked(mockHttp.post).mockResolvedValueOnce({ data: mockResult })

      const result = await client.refund('pay_123', 'Service not delivered')

      expect(mockHttp.post).toHaveBeenCalledWith('/payments/pay_123/refund', {
        reason: 'Service not delivered',
      })
      expect(result.success).toBe(true)
    })
  })
})
