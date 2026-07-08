import { describe, it, expect } from 'vitest'
import { rankProviders, DEFAULT_RADIUS_KM, type ProviderForRanking } from '@/lib/provider-search'

function provider(overrides: Partial<ProviderForRanking>): ProviderForRanking {
  return {
    id: 'p',
    slug: 'provider',
    name: 'Provider',
    bio: '',
    skills: ['PLUMBING'],
    rating: 4,
    totalReviews: 1,
    isRemote: false,
    address: 'Somewhere',
    latitude: 13.6929,
    longitude: -89.2182,
    ...overrides,
  }
}

const SEARCH = { lat: 13.6929, lng: -89.2182 } // San Salvador

describe('rankProviders()', () => {
  it('without a search point, sorts by rating desc then reviews desc, distance null', () => {
    const result = rankProviders(
      [
        provider({ id: 'a', rating: 4.2, totalReviews: 3 }),
        provider({ id: 'b', rating: 4.8, totalReviews: 1 }),
        provider({ id: 'c', rating: 4.2, totalReviews: 9 }),
      ],
      null,
    )
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a'])
    expect(result.every((p) => p.distanceKm === null)).toBe(true)
  })

  it('with a search point, returns nearby non-remote providers sorted by distance', () => {
    const near = provider({ id: 'near', latitude: 13.70, longitude: -89.22 })
    const far = provider({ id: 'far', latitude: 13.99, longitude: -89.56 }) // ~55 km
    const result = rankProviders([far, near], SEARCH, DEFAULT_RADIUS_KM)
    expect(result.map((p) => p.id)).toEqual(['near'])
    expect(result[0].distanceKm).toBeGreaterThan(0)
  })

  it('excludes non-remote providers outside the radius', () => {
    const far = provider({ id: 'far', latitude: 13.99, longitude: -89.56 })
    const result = rankProviders([far], SEARCH, 10)
    expect(result).toEqual([])
  })

  it('excludes non-remote providers without coordinates when searching by location', () => {
    const noCoords = provider({ id: 'x', latitude: null, longitude: null })
    expect(rankProviders([noCoords], SEARCH)).toEqual([])
  })

  it('always appends remote providers after nearby ones, sorted by rating, distance null', () => {
    const near = provider({ id: 'near', latitude: 13.70, longitude: -89.22 })
    const remoteHi = provider({ id: 'rh', isRemote: true, rating: 5, latitude: null, longitude: null })
    const remoteLo = provider({ id: 'rl', isRemote: true, rating: 3, latitude: null, longitude: null })
    const result = rankProviders([remoteLo, near, remoteHi], SEARCH)
    expect(result.map((p) => p.id)).toEqual(['near', 'rh', 'rl'])
    expect(result.find((p) => p.id === 'rh')?.distanceKm).toBeNull()
  })
})
