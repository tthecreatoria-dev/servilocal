// Forward-geocoding suggestions for the register location picker.
// Client-safe: hits Nominatim (OpenStreetMap) directly from the browser,
// same as the reverse geocode in location-picker. All failures degrade to [].

export type AddressSuggestion = {
  label: string
  lat: number
  lng: number
}

type RawNominatimResult = {
  display_name?: string
  lat?: string
  lon?: string
}

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

export function parseNominatimSuggestions(
  data: RawNominatimResult[],
): AddressSuggestion[] {
  const suggestions: AddressSuggestion[] = []
  const seenLabels = new Set<string>()
  for (const entry of data) {
    if (!entry.display_name || !entry.lat || !entry.lon) continue
    const lat = Number(entry.lat)
    const lng = Number(entry.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue
    // Nominatim can return the same display_name for different OSM object
    // types; identical labels are indistinguishable in the dropdown.
    if (seenLabels.has(entry.display_name)) continue
    seenLabels.add(entry.display_name)
    suggestions.push({ label: entry.display_name, lat, lng })
  }
  return suggestions
}

export async function searchAddressSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim()
  if (q.length === 0) return []

  try {
    const url = `${NOMINATIM_SEARCH}?format=json&limit=5&countrycodes=sv&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'es' },
      signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as RawNominatimResult[]
    return parseNominatimSuggestions(data)
  } catch {
    return []
  }
}
