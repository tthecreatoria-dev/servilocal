import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Set required env vars before importing the module
vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client-id')
vi.stubEnv('PAYPAL_SECRET', 'test-secret')
vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com')

import { createPayPalOrder, capturePayPalOrder, PayPalApiError } from '@/lib/paypal'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockTokenResponse() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'test-token' }),
  })
}

describe('createPayPalOrder', () => {
  it('returns orderId and approveUrl on success', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'ORDER_123',
        status: 'CREATED',
        links: [
          { href: 'https://paypal.com/approve', rel: 'approve', method: 'GET' },
        ],
      }),
    })

    const result = await createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel')

    expect(result).toEqual({ orderId: 'ORDER_123', approveUrl: 'https://paypal.com/approve' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws PayPalApiError when token request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })

  it('throws PayPalApiError when order creation fails', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })

  it('throws PayPalApiError when approve link is missing', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ORDER_123', status: 'CREATED', links: [] }),
    })

    await expect(
      createPayPalOrder('100.00', 'job_1', 'https://app/success', 'https://app/cancel'),
    ).rejects.toThrow(PayPalApiError)
  })
})

describe('capturePayPalOrder', () => {
  it('returns capture data on success', async () => {
    mockTokenResponse()
    const capture = {
      id: 'ORDER_123',
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'cap_1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '100.00' } }] } }],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => capture })

    const result = await capturePayPalOrder('ORDER_123')

    expect(result.purchase_units[0].payments.captures[0].status).toBe('COMPLETED')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_123/capture',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws PayPalApiError when capture fails', async () => {
    mockTokenResponse()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(capturePayPalOrder('ORDER_123')).rejects.toThrow(PayPalApiError)
  })
})
