"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

export const TN_CENTER: LatLngExpression = [11.4, 78.9];

export function MapBase({ center = TN_CENTER, zoom = 7, className = "h-[480px]", children, scrollWheelZoom = true }: { center?: LatLngExpression; zoom?: number; className?: string; children?: React.ReactNode; scrollWheelZoom?: boolean }) {
  return (
    <MapContainer center={center} zoom={zoom} preferCanvas scrollWheelZoom={scrollWheelZoom} className={`w-full rounded-[inherit] ${className}`} style={{ zIndex: 0 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
        maxZoom={19}
        className="geobite-tiles"
      />
      {children}
    </MapContainer>
  );
}

/** Fly the map to new bounds/centre when they change (e.g. district filter). */
export function FlyTo({ bounds, center, zoom }: { bounds?: LatLngBoundsExpression | null; center?: [number, number] | null; zoom?: number }) {
  const map = useMap();
  const key = JSON.stringify(bounds ?? center);
  useEffect(() => {
    if (bounds) map.flyToBounds(bounds, { padding: [24, 24], duration: 0.8 });
    else if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export const HEAT_COLORS = ["#22a06b", "#e2b203", "#f18d13", "#d1342f"];
export const HEAT_LABELS = ["Low", "Moderate", "High", "Very high"];
export const BEHAVIOUR_COLORS: Record<string, string> = {
  chasing: "#d9701c", barking: "#7f9dc6", threatening: "#c0392b", biting: "#8e1b1b", injured: "#7c3aed", other: "#5b8a68",
};
export const BEHAVIOUR_LABELS: Record<string, string> = {
  chasing: "Chasing (vehicles / pedestrians)", barking: "Frequent barking", threatening: "Threatening behaviour", biting: "Reported bite", injured: "Injured / needs vet", other: "Other / calm observations",
};
export const VAX_COLORS: Record<string, string> = { survey_estimate: "#12806f", confirmed_no_estimate: "#7fb8ad", unverified: "#cbd5e1", unavailable: "#f1f5f9" };
export const PRIORITY_COLORS: Record<string, string> = { low: "#cfe5d6", moderate: "#f5d77a", elevated: "#f0a35a", high: "#c0392b" };

export function coverageColor(c: number | null) {
  if (c === null) return VAX_COLORS.confirmed_no_estimate;
  if (c >= 0.7) return "#0f665a";
  if (c >= 0.5) return "#1a9a8a";
  if (c >= 0.3) return "#7fc4b8";
  return "#cfeee9";
}
