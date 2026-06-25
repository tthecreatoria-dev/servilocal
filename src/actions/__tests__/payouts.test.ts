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

import { updatePayoutSettings } from '@/actions/payouts'

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
