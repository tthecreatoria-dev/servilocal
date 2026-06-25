import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockProfileFindUnique = vi.hoisted(() => vi.fn())
const mockProfileUpdate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockJobPaymentFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    providerProfile: { findUnique: mockProfileFindUnique, update: mockProfileUpdate },
    jobPayment: { findUnique: mockJobPaymentFindUnique },
    $transaction: mockTransaction,
  },
}))

import { updatePayoutSettings, markPayoutPaid } from '@/actions/payouts'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updatePayoutSettings()', () => {
  const PROVIDER_SESSION = { user: { id: 'prov_1', role: 'PROVIDER' } }

  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'a@b.com' }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects non-providers', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } })
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'a@b.com' }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    expect(await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'nope' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('saves a PayPal destination and clears the Tkiero one', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue({ id: 'pp_1', userId: 'prov_1' })
    mockProfileUpdate.mockResolvedValue({})
    const result = await updatePayoutSettings({ payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com' })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: { payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com', tkieroAccount: null },
    })
  })

  it('saves a Tkiero destination and clears the PayPal one', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue({ id: 'pp_1', userId: 'prov_1' })
    mockProfileUpdate.mockResolvedValue({})
    const result = await updatePayoutSettings({ payoutMethod: 'TKIERO', tkieroAccount: '@pedro' })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: { payoutMethod: 'TKIERO', tkieroAccount: '@pedro', paypalEmail: null },
    })
  })

  it('errors when the provider profile does not exist', async () => {
    mockAuth.mockResolvedValue(PROVIDER_SESSION)
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await updatePayoutSettings({ payoutMethod: 'TKIERO', tkieroAccount: '@pedro' }))
      .toEqual({ success: false, error: 'profile_not_found' })
  })
})

describe('markPayoutPaid()', () => {
  const ADMIN_SESSION = { user: { id: 'admin_1', role: 'ADMIN' } }
  const PAY_ID = 'cjld2cjxh0000qzrmn831i7rn'

  function makeTx(paymentOverrides: Record<string, unknown> = {}, profile: unknown = {
    payoutMethod: 'PAYPAL', paypalEmail: 'pedro@mail.com', tkieroAccount: null,
  }) {
    return {
      jobPayment: {
        findUnique: vi.fn().mockResolvedValue({
          id: PAY_ID, status: 'PENDING_PAYOUT', amount: 100,
          commission: { id: 'comm_1', amount: 12 },
          jobPost: { applications: [{ providerId: 'prov_1' }] },
          ...paymentOverrides,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      providerProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      payout: { create: vi.fn().mockResolvedValue({ id: 'payout_1' }) },
    }
  }

  it('rejects non-admin callers', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects payments that are not PENDING_PAYOUT', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({ status: 'RELEASED' })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'payment_not_pending_payout' })
  })

  it('rejects when the provider has no payout destination', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({}, { payoutMethod: null, paypalEmail: null, tkieroAccount: null })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'payout_destination_missing' })
    expect(tx.payout.create).not.toHaveBeenCalled()
    expect(tx.jobPayment.update).not.toHaveBeenCalled()
  })

  it('rejects when no commission exists (never release without commission)', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx({ commission: null })
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    expect(await markPayoutPaid({ jobPaymentId: PAY_ID }))
      .toEqual({ success: false, error: 'commission_missing' })
  })

  it('creates an audit Payout with the net amount and releases the payment', async () => {
    mockAuth.mockResolvedValue(ADMIN_SESSION)
    const tx = makeTx()
    mockTransaction.mockImplementation(async (fn) => fn(tx))
    const result = await markPayoutPaid({ jobPaymentId: PAY_ID, reference: 'PP-TX-9' })
    expect(result.success).toBe(true)
    expect(tx.payout.create).toHaveBeenCalledWith({
      data: {
        jobPaymentId: PAY_ID,
        providerId: 'prov_1',
        amount: 88,
        method: 'PAYPAL',
        destination: 'pedro@mail.com',
        reference: 'PP-TX-9',
        paidById: 'admin_1',
      },
    })
    expect(tx.jobPayment.update).toHaveBeenCalledWith({
      where: { id: PAY_ID }, data: { status: 'RELEASED' },
    })
  })
})
