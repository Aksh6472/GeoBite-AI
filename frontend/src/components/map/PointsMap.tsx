"use client";

import { CircleMarker, Popup } from "react-leaflet";
import { fmtDate } from "@/lib/format";
import { MapBase } from "./MapBase";

type Pt = { id: number; code: string; lat: number; lng: number; category: string; date: string };

/** Hospital's own incident locations (authorised clinical users only). */
export default function PointsMap({ points, className = "h-[360px]" }: { points: Pt[]; className?: string }) {
  const c: [number, number] = points.length ? [points.reduce((s, p) => s + p.lat, 0) / points.length, points.reduce((s, p) => s + p.lng, 0) / points.length] : [11.4, 78.9];
  const spread = points.length ? Math.max(...points.map((p) => Math.abs(p.lat - c[0]))) : 3;
  return (
    <MapBase className={className} center={c} zoom={spread > 1 ? 7 : 12}>
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={3.5} pathOptions={{ color: "#0e1f38", weight: 1, fillColor: p.category === "cat_iii" ? "#c0392b" : "#1a9a8a", fillOpacity: 0.8 }}>
          <Popup><a href={`/hospital/incidents/${p.id}`} className="font-semibold">{p.code}</a><br />{fmtDate(p.date)}</Popup>
        </CircleMarker>
      ))}
    </MapBase>
  );
}
