import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockUserUpdate = vi.hoisted(() => vi.fn())
const mockProfileUpdate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { update: mockUserUpdate },
    providerProfile: { update: mockProfileUpdate },
    $transaction: mockTransaction,
  },
}))

import { updateProfile } from '@/actions/profile'

beforeEach(() => {
  vi.clearAllMocks()
  // db.$transaction receives an array of promises here (sequential writes pattern)
  mockTransaction.mockImplementation(async (ops) => Promise.all(ops))
})

describe('updateProfile()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updateProfile({ name: 'Ana López', phone: '+50379000000' }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await updateProfile({ name: 'A', phone: '+50379000000' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('updates only user fields for a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({ name: 'Ana López', phone: '+50379000000' })
    expect(result.success).toBe(true)
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Ana López', phone: '+50379000000' },
    })
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })

  it('updates user + provider profile for a PROVIDER in one transaction', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    mockProfileUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({
      name: 'Pedro', phone: '+50379000001', bio: 'Fontanero', skills: ['PLUMBING'],
      isRemote: false, address: 'Col. Escalón, San Salvador', latitude: 13.7, longitude: -89.24,
    })
    expect(result.success).toBe(true)
    expect(mockTransaction).toHaveBeenCalled()
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { userId: 'prov_1' },
      data: {
        bio: 'Fontanero', skills: ['PLUMBING'], showPhone: false, isRemote: false,
        address: 'Col. Escalón, San Salvador', latitude: 13.7, longitude: -89.24,
      },
    })
  })

  it('persists showPhone=true for a PROVIDER', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    mockProfileUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({
      name: 'Pedro', phone: '+50379000001', isRemote: true, showPhone: true,
    })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showPhone: true }) }),
    )
  })

  it('defaults showPhone to false when omitted', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    mockProfileUpdate.mockReturnValue(Promise.resolve({}))
    await updateProfile({ name: 'Pedro', phone: '+50379000001', isRemote: true })
    expect(mockProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ showPhone: false }) }),
    )
  })

  it('ignores showPhone for a CLIENT (never touches providerProfile)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    mockUserUpdate.mockReturnValue(Promise.resolve({}))
    const result = await updateProfile({ name: 'Ana López', phone: '+50379000000', showPhone: true })
    expect(result.success).toBe(true)
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })

  it('rejects a non-boolean showPhone', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    const result = await updateProfile({
      // @ts-expect-error — validación en runtime de entrada externa
      name: 'Pedro', phone: '+50379000001', isRemote: true, showPhone: 'yes',
    })
    expect(result).toEqual({ success: false, error: 'validation' })
  })
})
