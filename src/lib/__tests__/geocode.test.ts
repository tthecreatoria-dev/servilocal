import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { haversineKm, geocodeAddress } from '@/lib/geocode'

describe('haversineKm()', () => {
  it('returns ~0 for identical points', () => {
    const p = { lat: 13.6929, lng: -89.2182 }
    expect(haversineKm(p, p)).toBeCloseTo(0, 5)
  })

  it('computes the San Salvador → Santa Ana distance (~55 km)', () => {
    const sanSalvador = { lat: 13.6929, lng: -89.2182 }
    const santaAna = { lat: 13.9942, lng: -89.5597 }
    const km = haversineKm(sanSalvador, santaAna)
    expect(km).toBeGreaterThan(45)
    expect(km).toBeLessThan(65)
  })
})

describe('geocodeAddress()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the first result coordinates on success', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '13.6929', lon: '-89.2182' }],
    })
    const result = await geocodeAddress('San Salvador')
    expect(result).toEqual({ lat: 13.6929, lng: -89.2182 })
  })

  it('returns null when there are no matches', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    expect(await geocodeAddress('asdfqwer')).toBeNull()
  })

  it('returns null on a non-ok response', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    expect(await geocodeAddress('San Salvador')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))
    expect(await geocodeAddress('San Salvador')).toBeNull()
  })

  it('returns null for an empty query without calling fetch', async () => {
    const result = await geocodeAddress('   ')
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
