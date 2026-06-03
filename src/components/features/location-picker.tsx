'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

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

  useEffect(() => {
    return () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    }
  }, [])

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
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.isRemote}
          onChange={(e) => onChange((prev) => ({ ...prev, isRemote: e.target.checked }))}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-label-md text-on-surface">Trabajo remoto / en línea</span>
      </label>

      {!value.isRemote && (
        <div className="space-y-3">
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
                onChange={(e) => {
                  addressEdited.current = true
                  const next = e.target.value
                  onChange((prev) => ({ ...prev, address: next }))
                }}
                placeholder="Ej: Col. Escalón, San Salvador"
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-11 pr-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
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
