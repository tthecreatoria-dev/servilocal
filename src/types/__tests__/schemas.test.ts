import { describe, it, expect } from 'vitest'
import { TkieroWebhookSchema, CreateJobPostSchema } from '@/types/schemas'

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

describe('CreateJobPostSchema location rules', () => {
  const base = {
    title: 'Fix my pipes',
    description: 'I need someone to fix leaking pipes in my bathroom',
    category: 'PLUMBING' as const,
    budget: 50,
    deadline: '2026-12-31T00:00:00.000Z',
  }

  it('accepts a remote job with no location', () => {
    const result = CreateJobPostSchema.safeParse({ ...base, isRemote: true })
    expect(result.success).toBe(true)
  })

  it('accepts a non-remote job with full location', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.7,
      longitude: -89.22,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-remote job missing coordinates', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
    })
    expect(result.success).toBe(false)
  })

  it('rejects coordinates out of range', () => {
    const result = CreateJobPostSchema.safeParse({
      ...base,
      isRemote: false,
      address: 'Somewhere',
      latitude: 200,
      longitude: -89.22,
    })
    expect(result.success).toBe(false)
  })
})
