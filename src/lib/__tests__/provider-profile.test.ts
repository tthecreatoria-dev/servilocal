import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProfileFindUnique = vi.hoisted(() => vi.fn())
const mockUserFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    providerProfile: { findUnique: mockProfileFindUnique },
    user: { findUnique: mockUserFindUnique },
  },
}))

import { getPublicProviderProfile } from '@/lib/provider-profile'

const baseRow = {
  userId: 'u1',
  slug: 'pedro-garcia',
  bio: 'Plomero certificado',
  skills: ['PLUMBING'],
  rating: 4.8,
  totalReviews: 32,
  isRemote: false,
  address: 'San Salvador',
  showPhone: false,
  user: { name: 'Pedro García' },
  services: [
    { id: 's1', title: 'Reparación de fugas', description: 'desc', price: 25.5, category: 'PLUMBING' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPublicProviderProfile', () => {
  it('devuelve null para un slug desconocido', async () => {
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await getPublicProviderProfile('no-existe')).toBe(null)
  })

  it('nunca selecciona ni expone el teléfono cuando showPhone es false (regla dura)', async () => {
    mockProfileFindUnique.mockResolvedValue({ ...baseRow, showPhone: false })

    const result = await getPublicProviderProfile('pedro-garcia')

    expect(result?.phone).toBe(null)
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    const select = mockProfileFindUnique.mock.calls[0][0].select
    expect(select).not.toHaveProperty('phone')
    expect(select.user.select).not.toHaveProperty('phone')
  })

  it('obtiene el teléfono en una segunda consulta solo cuando showPhone es true', async () => {
    mockProfileFindUnique.mockResolvedValue({ ...baseRow, showPhone: true })
    mockUserFindUnique.mockResolvedValue({ phone: '+503 7900 0001' })

    const result = await getPublicProviderProfile('pedro-garcia')

    expect(result?.phone).toBe('+503 7900 0001')
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { phone: true },
    })
  })

  it('mapea nombre, servicios (precio como number) y no expone showPhone', async () => {
    mockProfileFindUnique.mockResolvedValue({ ...baseRow, showPhone: false })

    const result = await getPublicProviderProfile('pedro-garcia')

    expect(result?.name).toBe('Pedro García')
    expect(result?.services[0]).toEqual({
      id: 's1', title: 'Reparación de fugas', description: 'desc', price: 25.5, category: 'PLUMBING',
    })
    expect(typeof result?.services[0].price).toBe('number')
    expect(result).not.toHaveProperty('showPhone')
  })
})
