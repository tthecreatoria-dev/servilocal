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

import {
  UpdatePayoutSettingsSchema,
  UpdateProfileSchema,
  StartJobSchema,
  MarkPayoutPaidSchema,
  UpdateServiceSchema,
  ToggleServiceActiveSchema,
} from '@/types/schemas'

describe('UpdatePayoutSettingsSchema', () => {
  it('accepts PAYPAL with a valid email', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'PAYPAL',
      paypalEmail: 'pedro@example.com',
    })
    expect(r.success).toBe(true)
  })

  it('rejects PAYPAL with an invalid email', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'PAYPAL',
      paypalEmail: 'not-an-email',
    })
    expect(r.success).toBe(false)
  })

  it('accepts TKIERO with an account id', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'TKIERO',
      tkieroAccount: '@pedro-sv',
    })
    expect(r.success).toBe(true)
  })

  it('rejects TKIERO with a blank account', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'TKIERO',
      tkieroAccount: '  ',
    })
    expect(r.success).toBe(false)
  })

  it('rejects an unknown method', () => {
    const r = UpdatePayoutSettingsSchema.safeParse({
      payoutMethod: 'ZELLE',
      paypalEmail: 'x@y.com',
    })
    expect(r.success).toBe(false)
  })
})

describe('UpdateProfileSchema', () => {
  it('accepts minimal client data', () => {
    const r = UpdateProfileSchema.safeParse({ name: 'Ana López', phone: '+50379000000' })
    expect(r.success).toBe(true)
  })

  it('accepts provider fields', () => {
    const r = UpdateProfileSchema.safeParse({
      name: 'Pedro',
      phone: '+50379000001',
      bio: 'Fontanero con 10 años de experiencia',
      skills: ['PLUMBING', 'ELECTRICAL'],
      isRemote: false,
      address: 'Col. Escalón, San Salvador',
      latitude: 13.7,
      longitude: -89.24,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a too-short name', () => {
    expect(UpdateProfileSchema.safeParse({ name: 'A', phone: '+50379000000' }).success).toBe(false)
  })

  it('rejects an unknown skill', () => {
    const r = UpdateProfileSchema.safeParse({
      name: 'Pedro', phone: '+50379000001', skills: ['HACKING'],
    })
    expect(r.success).toBe(false)
  })
})

describe('StartJobSchema / MarkPayoutPaidSchema', () => {
  it('accepts a cuid jobPostId', () => {
    expect(StartJobSchema.safeParse({ jobPostId: 'cjld2cjxh0000qzrmn831i7rn' }).success).toBe(true)
  })

  it('rejects a non-cuid id', () => {
    expect(StartJobSchema.safeParse({ jobPostId: '123' }).success).toBe(false)
  })

  it('accepts payout id with optional reference', () => {
    expect(MarkPayoutPaidSchema.safeParse({
      jobPaymentId: 'cjld2cjxh0000qzrmn831i7rn', reference: 'PAYPAL-TX-1',
    }).success).toBe(true)
    expect(MarkPayoutPaidSchema.safeParse({
      jobPaymentId: 'cjld2cjxh0000qzrmn831i7rn',
    }).success).toBe(true)
  })
})

describe('UpdateServiceSchema', () => {
  const valid = {
    id: 'cjld2cjxh0000qzrmn831i7rn',
    title: 'Reparación de fugas',
    description: 'Detección y reparación de fugas de agua en tuberías residenciales.',
    price: 25,
    category: 'PLUMBING',
  }

  it('accepts a valid update', () => {
    expect(UpdateServiceSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a non-cuid id', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false)
  })

  it('rejects a short title', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, title: 'Fix' }).success).toBe(false)
  })

  it('rejects a non-positive price', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, price: 0 }).success).toBe(false)
  })

  it('rejects an unknown category', () => {
    expect(UpdateServiceSchema.safeParse({ ...valid, category: 'MAGIC' }).success).toBe(false)
  })
})

describe('ToggleServiceActiveSchema', () => {
  it('accepts a valid toggle', () => {
    expect(
      ToggleServiceActiveSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn', isActive: false }).success,
    ).toBe(true)
  })

  it('rejects a non-boolean isActive', () => {
    expect(
      ToggleServiceActiveSchema.safeParse({ id: 'cjld2cjxh0000qzrmn831i7rn', isActive: 'yes' }).success,
    ).toBe(false)
  })
})
