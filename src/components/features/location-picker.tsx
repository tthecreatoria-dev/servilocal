'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  searchAddressSuggestions,
  type AddressSuggestion,
} from '@/lib/address-suggestions'

const LocationMap = dynamic(
  () => import('./location-map').then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full rounded-xl border border-outline-variant bg-surface-container animate-pulse" />
    ),
  },
)

// San Salvador — sensible default center for a Salvadoran marketplace.
const DEFAULT_LAT = 13.6929
const DEFAULT_LNG = -89.2182

export type LocationValue = {
  isRemote: boolean
  address: string
  latitude: number | null
  longitude: number | null
}

type LocationPickerProps = {
  value: LocationValue
  onChange: (next: LocationValue | ((prev: LocationValue) => LocationValue)) => void
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'es' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name ?? null
  } catch {
    return null
  }
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressEdited = useRef(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  // null = dropdown closed; [] = open showing "Sin resultados"
  const [suggestions, setSuggestions] = useState<AddressSuggestion[] | null>(null)

  useEffect(() => {
    return () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchAbort.current?.abort()
    }
  }, [])

  function handleAddressChange(next: string) {
    addressEdited.current = true
    onChange((prev) => ({ ...prev, address: next }))

    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()

    const q = next.trim()
    if (q.length < 3) {
      setSuggestions(null)
      return
    }
    searchTimer.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbort.current = controller
      const results = await searchAddressSuggestions(q, controller.signal)
      if (controller.signal.aborted) return
      setSuggestions(results)
    }, 700)
  }

  function handleSelect(suggestion: AddressSuggestion) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
    onChange((prev) => ({
      ...prev,
      address: suggestion.label,
      latitude: suggestion.lat,
      longitude: suggestion.lng,
    }))
    setSuggestions(null)
  }

  function handlePick(lat: number, lng: number) {
    onChange((prev) => ({ ...prev, latitude: lat, longitude: lng }))
    if (addressEdited.current) return
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      const found = await reverseGeocode(lat, lng)
      if (found && !addressEdited.current) {
        onChange((prev) => ({ ...prev, address: found }))
      }
    }, 600)
  }

  const lat = value.latitude ?? DEFAULT_LAT
  const lng = value.longitude ?? DEFAULT_LNG

  return (
    <div className="motion-panel space-y-4">
      <label className="motion-interactive flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.isRemote}
          onChange={(e) => onChange((prev) => ({ ...prev, isRemote: e.target.checked }))}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-label-md text-on-surface">Trabajo remoto / en línea</span>
      </label>

      {!value.isRemote && (
        <div className="motion-reveal space-y-3">
          <div className="space-y-2">
            <label htmlFor="address" className="block text-label-md text-on-surface">
              Dirección
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                location_on
              </span>
              <input
                id="address"
                name="address"
                value={value.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onKeyDown={(e) => {
                  if (suggestions === null) return
                  if (e.key === 'Escape') {
                    setSuggestions(null)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const first = suggestions[0]
                    if (first) handleSelect(first)
                  }
                }}
                onBlur={() => setSuggestions(null)}
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestions !== null}
                aria-controls="address-suggestions"
                placeholder="Ej: Col. Escalón, San Salvador"
                className="motion-field w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
              {suggestions !== null && (
                <ul
                  id="address-suggestions"
                  role="listbox"
                  className="motion-list absolute z-[1100] top-full left-0 right-0 mt-1 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-md overflow-hidden"
                >
                  {suggestions.length === 0 ? (
                    <li className="px-4 py-3 text-body-md text-on-surface-variant">
                      Sin resultados
                    </li>
                  ) : (
                    suggestions.map((s) => (
                      <li key={`${s.lat},${s.lng}`} role="option" aria-selected={false} className="motion-list-item">
                        <button
                          type="button"
                          // mousedown fires before the input's blur, so selection
                          // wins over the blur-close
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleSelect(s)
                          }}
                          className="motion-interactive w-full flex items-start gap-2 px-4 py-3 text-left text-body-md text-on-surface hover:bg-surface-container transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0 mt-0.5">
                            location_on
                          </span>
                          <span className="line-clamp-2">{s.label}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>

          <LocationMap lat={lat} lng={lng} onPick={handlePick} />
          <p className="text-label-sm text-on-surface-variant">
            Toca el mapa o arrastra el pin para marcar la ubicación.
          </p>
        </div>
      )}
    </div>
  )
}
