'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet's default icon URLs break under bundlers; point them at the CDN explicitly.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

type LocationMapProps = {
  lat: number
  lng: number
  onPick: (lat: number, lng: number) => void
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

type PinMove = { lat: number; lng: number }

// MapContainer's `center` only applies on mount; this pans the view when the
// coordinates change from outside the map (e.g. an address suggestion pick).
// Moves that originate inside the map (click/drag) are skipped so the view
// doesn't jump under the user's cursor.
function Recenter({
  lat,
  lng,
  lastInternalMove,
}: PinMove & { lastInternalMove: RefObject<PinMove | null> }) {
  const map = useMap()
  useEffect(() => {
    const internal = lastInternalMove.current
    if (internal && internal.lat === lat && internal.lng === lng) return
    map.flyTo([lat, lng], map.getZoom())
  }, [map, lat, lng, lastInternalMove])
  return null
}

export function LocationMap({ lat, lng, onPick }: LocationMapProps) {
  const lastInternalMove = useRef<PinMove | null>(null)

  function handlePick(pickedLat: number, pickedLng: number) {
    lastInternalMove.current = { lat: pickedLat, lng: pickedLng }
    onPick(pickedLat, pickedLng)
  }

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '260px', width: '100%' }}
      className="motion-reveal motion-surface rounded-xl overflow-hidden border border-outline-variant"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={handlePick} />
      <Recenter lat={lat} lng={lng} lastInternalMove={lastInternalMove} />
      <Marker
        position={[lat, lng]}
        draggable
        icon={markerIcon}
        eventHandlers={{
          dragend(e) {
            const pos = e.target.getLatLng()
            handlePick(pos.lat, pos.lng)
          },
        }}
      />
    </MapContainer>
  )
}
