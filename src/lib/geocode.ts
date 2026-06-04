// Forward geocoding + great-circle distance for provider search.
// Server-only: hits Nominatim (OpenStreetMap). All failures degrade to null.

export type LatLng = { lat: number; lng: number }

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const q = query.trim()
  if (q.length === 0) return null

  try {
    const url = `${NOMINATIM_SEARCH}?format=json&limit=1&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'ServiLocal/1.0 (provider-search)',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const first = data[0]
    if (!first?.lat || !first?.lon) return null
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
