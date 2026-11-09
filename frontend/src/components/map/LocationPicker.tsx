"use client";

import { CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import { FlyTo, MapBase } from "./MapBase";

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

export default function LocationPicker({ value, onChange, focus, className = "h-[320px]" }: { value: { lat: number; lng: number } | null; onChange: (lat: number, lng: number) => void; focus?: [number, number] | null; className?: string }) {
  return (
    <MapBase center={value ? [value.lat, value.lng] : focus ?? [11.4, 78.9]} zoom={value || focus ? 14 : 7} className={className}>
      <ClickCapture onPick={onChange} />
      <FlyTo center={value ? [value.lat, value.lng] : focus ?? null} zoom={15} />
      {value && (
        <CircleMarker center={[value.lat, value.lng]} radius={9} pathOptions={{ color: "#0e1f38", weight: 3, fillColor: "#1a9a8a", fillOpacity: 0.9 }}>
          <Tooltip direction="top" offset={[0, -8]} permanent>Selected location</Tooltip>
        </CircleMarker>
      )}
    </MapBase>
  );
}
