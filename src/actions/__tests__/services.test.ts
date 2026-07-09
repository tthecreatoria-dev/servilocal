import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockProfileFindUnique = vi.hoisted(() => vi.fn())
const mockServiceFindUnique = vi.hoisted(() => vi.fn())
const mockServiceCreate = vi.hoisted(() => vi.fn())
const mockServiceUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    providerProfile: { findUnique: mockProfileFindUnique },
    service: {
      findUnique: mockServiceFindUnique,
      create: mockServiceCreate,
      update: mockServiceUpdate,
    },
  },
}))

import { createService, updateService, toggleServiceActive } from '@/actions/services'

const SERVICE_ID = 'cjld2cjxh0000qzrmn831i7rn'

const validCreate = {
  title: 'Reparación de fugas',
  description: 'Detección y reparación de fugas de agua en tuberías residenciales.',
  price: 25,
  category: 'PLUMBING' as const,
}

const validUpdate = { ...validCreate, id: SERVICE_ID }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createService()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await createService(validCreate)).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await createService(validCreate)).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await createService({ ...validCreate, price: -5 }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('rejects a PROVIDER without a profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await createService(validCreate)).toEqual({ success: false, error: 'profile_not_found' })
  })

  it('creates the service linked to the provider profile', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockProfileFindUnique.mockResolvedValue({ id: 'profile_1' })
    mockServiceCreate.mockResolvedValue({})
    const result = await createService(validCreate)
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceCreate).toHaveBeenCalledWith({
      data: { ...validCreate, providerId: 'profile_1' },
    })
  })
})

describe('updateService()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    expect(await updateService({ ...validUpdate, id: 'nope' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it('rejects a service that does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue(null)
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'service_not_found' })
  })

  it("rejects another provider's service", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_2' } })
    expect(await updateService(validUpdate)).toEqual({ success: false, error: 'service_not_found' })
    expect(mockServiceUpdate).not.toHaveBeenCalled()
  })

  it('updates an owned service', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_1' } })
    mockServiceUpdate.mockResolvedValue({})
    const result = await updateService(validUpdate)
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: SERVICE_ID },
      data: {
        title: validCreate.title,
        description: validCreate.description,
        price: validCreate.price,
        category: validCreate.category,
      },
    })
  })
})

describe('toggleServiceActive()', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'unauthorized' })
  })

  it('rejects a CLIENT', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } })
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'forbidden' })
  })

  it('rejects invalid input', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    // @ts-expect-error — validación en runtime de entrada externa
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: 'yes' }))
      .toEqual({ success: false, error: 'validation' })
  })

  it("rejects another provider's service", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_2' } })
    expect(await toggleServiceActive({ id: SERVICE_ID, isActive: false }))
      .toEqual({ success: false, error: 'service_not_found' })
  })

  it('toggles an owned service', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'prov_1', role: 'PROVIDER' } })
    mockServiceFindUnique.mockResolvedValue({ provider: { userId: 'prov_1' } })
    mockServiceUpdate.mockResolvedValue({})
    const result = await toggleServiceActive({ id: SERVICE_ID, isActive: false })
    expect(result).toEqual({ success: true, data: null })
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: SERVICE_ID },
      data: { isActive: false },
    })
  })
})
