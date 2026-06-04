import { haversineKm, type LatLng } from './geocode'
import type { ServiceCategory } from '@/types/index'

export const DEFAULT_RADIUS_KM = 25

export type ProviderForRanking = {
  id: string
  name: string
  bio: string
  skills: ServiceCategory[]
  rating: number
  totalReviews: number
  isRemote: boolean
  address: string | null
  latitude: number | null
  longitude: number | null
}

export type RankedProvider = ProviderForRanking & { distanceKm: number | null }

function byRating(a: ProviderForRanking, b: ProviderForRanking): number {
  if (b.rating !== a.rating) return b.rating - a.rating
  return b.totalReviews - a.totalReviews
}

export function rankProviders(
  providers: ProviderForRanking[],
  searchPoint: LatLng | null,
  radiusKm: number = DEFAULT_RADIUS_KM,
): RankedProvider[] {
  if (!searchPoint) {
    return [...providers]
      .sort(byRating)
      .map((p) => ({ ...p, distanceKm: null }))
  }

  const nearby: RankedProvider[] = []
  const remote: ProviderForRanking[] = []

  for (const p of providers) {
    if (p.isRemote) {
      remote.push(p)
      continue
    }
    if (p.latitude === null || p.longitude === null) continue
    const distanceKm = haversineKm(searchPoint, { lat: p.latitude, lng: p.longitude })
    if (distanceKm <= radiusKm) nearby.push({ ...p, distanceKm })
  }

  nearby.sort((a, b) => (a.distanceKm! - b.distanceKm!) || byRating(a, b))
  const remoteRanked: RankedProvider[] = remote
    .sort(byRating)
    .map((p) => ({ ...p, distanceKm: null }))

  return [...nearby, ...remoteRanked]
}
