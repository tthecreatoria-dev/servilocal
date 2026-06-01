import { describe, it, expect } from 'vitest'
import { TkieroWebhookSchema } from '@/types/schemas'

const base = {
  event: 'payment.confirmed' as const,
  paymentId: 'pay_123',
  amount: 100,
  timestamp: '2026-05-28T00:00:00Z',
}

describe('TkieroWebhookSchema', () => {
  it('accepts serviceRequest metadata', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { serviceRequestId: 'req_1', clientId: 'usr_1', providerId: 'usr_2', category: 'DELIVERY' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts jobPost metadata', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { jobPostId: 'job_1', clientId: 'usr_1' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects metadata with neither serviceRequestId nor jobPostId', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { clientId: 'usr_1' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects metadata with both jobPostId and serviceRequestId mixed', () => {
    const result = TkieroWebhookSchema.safeParse({
      ...base,
      metadata: { jobPostId: 'job_1', serviceRequestId: 'req_1', clientId: 'usr_1', providerId: 'usr_2', category: 'DELIVERY' },
    })
    expect(result.success).toBe(false)
  })
})
