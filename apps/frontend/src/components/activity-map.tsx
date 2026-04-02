"use client"

import polylineDecode from "@mapbox/polyline"
import { useEffect } from "react"
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [20, 20] })
    }
  }, [map, positions])
  return null
}

export default function ActivityMap({ polyline }: { polyline: string }) {
  const positions = polylineDecode.decode(polyline) as [number, number][]

  if (positions.length === 0) return null

  const center = positions[Math.floor(positions.length / 2)]

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: 300, width: "100%" }}
      zoomControl={true}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={positions} color="hsl(221, 83%, 53%)" weight={3} />
      <FitBounds positions={positions} />
    </MapContainer>
  )
}
