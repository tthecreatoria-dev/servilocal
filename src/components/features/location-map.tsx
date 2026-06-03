'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
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

export function LocationMap({ lat, lng, onPick }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '260px', width: '100%' }}
      className="rounded-xl overflow-hidden border border-outline-variant"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <Marker
        position={[lat, lng]}
        draggable
        icon={markerIcon}
        eventHandlers={{
          dragend(e) {
            const pos = e.target.getLatLng()
            onPick(pos.lat, pos.lng)
          },
        }}
      />
    </MapContainer>
  )
}
