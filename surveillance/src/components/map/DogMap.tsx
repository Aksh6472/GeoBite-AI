"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LMap } from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { gridCells, type LatLng } from "@/lib/geo";
import { ATTRACTOR_META, type Attractor } from "@/lib/osm";
import type { BiteWard } from "@/lib/bites";
import type { CameraCfg, Scan, Sighting } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";

import { SAT_ATTRIBUTION, SAT_URL } from "./tiles";

export type Basemap = "street" | "satellite";

export type DogMapProps = {
  basemap?: Basemap; height?: string; center?: LatLng; zoom?: number;
  sightings?: Sighting[]; cameras?: CameraCfg[]; attractors?: Attractor[]; scans?: Scan[];
  dogs?: { lat: number; lng: number; score: number }[];
  bites?: (BiteWard & { level?: string })[];
  onWard?: (ward: string) => void;
  area?: { center: LatLng; radiusM: number } | null;
  pin?: LatLng | null;
  onClick?: (p: LatLng) => void; onReady?: (m: LMap) => void; onMove?: (m: LMap) => void;
  fitKey?: string; // change to re-fit the view to the data
  focus?: { at: LatLng; zoom?: number; key: string } | null; // change key to fly to a point
};

function Focus({ focus }: { focus?: DogMapProps["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo(focus.at, focus.zoom ?? Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Events({ onClick, onReady, onMove }: Pick<DogMapProps, "onClick" | "onReady" | "onMove">) {
  const map = useMapEvents({
    click: (e) => onClick?.([e.latlng.lat, e.latlng.lng]),
    moveend: () => onMove?.(map),
    zoomend: () => onMove?.(map),
  });
  useEffect(() => { onReady?.(map); onMove?.(map); }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FitToData({ points, fitKey }: { points: LatLng[]; fitKey?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!fitKey || !points.length) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 16));
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 17 });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const age = (iso: string) => (Date.now() - Date.parse(iso)) / 3600e3;
const recencyColor = (iso: string) => (age(iso) < 1 ? "#d1342f" : age(iso) < 24 ? "#f18d13" : age(iso) < 168 ? "#e2b203" : "#8a96a8");

export default function DogMap({
  basemap = "street", height = "h-[520px]", center = [20.6, 78.9], zoom = 5,
  sightings = [], cameras = [], attractors = [], scans = [], dogs = [], bites = [], area, pin, onWard,
  onClick, onReady, onMove, fitKey, focus,
}: DogMapProps) {
  const cells = gridCells(sightings);
  const fitPoints: LatLng[] = [...cameras.map((c) => [c.lat, c.lng] as LatLng), ...sightings.slice(0, 500).map((s) => [s.lat, s.lng] as LatLng)];

  return (
    <MapContainer center={center} zoom={zoom} maxZoom={20} preferCanvas scrollWheelZoom className={`w-full rounded-[inherit] ${height}`} style={{ zIndex: 0, cursor: onClick ? "crosshair" : undefined }}>
      {basemap === "satellite" ? (
        <TileLayer key="sat" attribution={SAT_ATTRIBUTION} url={SAT_URL} maxNativeZoom={19} maxZoom={20} />
      ) : (
        <TileLayer key="osm" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={20} className="muted-tiles" />
      )}
      <Events onClick={onClick} onReady={onReady} onMove={onMove} />
      <FitToData points={fitPoints} fitKey={fitKey} />
      <Focus focus={focus} />

      {scans.filter((s) => s.bounds).map((s) => (
        <Rectangle key={s.id} bounds={s.bounds!} pathOptions={{ color: s.dogs ? "#d1342f" : "#7f9dc6", weight: 1.5, dashArray: "4 4", fillOpacity: 0.04 }}>
          <Tooltip>{s.kind === "satellite" ? "Satellite scan" : "Aerial photo"} · {fmtDateTime(s.at)}<br />{s.dogs} dog{s.dogs === 1 ? "" : "s"} found{s.metresPerPx ? ` · ${s.metresPerPx.toFixed(2)} m/pixel` : ""}</Tooltip>
        </Rectangle>
      ))}

      {bites.map((b) => {
        const n = b.bites ?? 0;
        const color = b.level === "High" ? "#c0392b" : b.level === "Medium" ? "#d9701c" : "#e2b203";
        return (
          <Circle key={`${b.ward}:${b.district}`} center={[b.lat, b.lng]} radius={b.suppressed ? 250 : 250 + Math.sqrt(n) * 170}
            eventHandlers={onWard ? { click: () => onWard(b.ward) } : undefined}
            pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: b.suppressed ? 0.08 : 0.28, dashArray: b.suppressed ? "4 4" : undefined }}>
            <Tooltip><strong>{b.ward}</strong> · {b.district}<br />{b.suppressed ? "Fewer than 3 bites (hidden)" : `${n} dog bite${n === 1 ? "" : "s"} reported`}{b.level ? <><br />Combined risk: {b.level}</> : null}</Tooltip>
          </Circle>
        );
      })}

      {area && <Circle center={area.center} radius={area.radiusM} pathOptions={{ color: "#0e1f38", weight: 2, dashArray: "6 5", fillColor: "#1a9a8a", fillOpacity: 0.08 }} />}

      {attractors.map((a) => (
        <CircleMarker key={a.id} center={[a.lat, a.lng]} radius={4 + ATTRACTOR_META[a.kind].weight} pathOptions={{ color: "#fff", weight: 1, fillColor: ATTRACTOR_META[a.kind].color, fillOpacity: 0.9 }}>
          <Tooltip><strong>{a.name}</strong><br />{ATTRACTOR_META[a.kind].label} · <span style={{ fontFamily: "monospace" }}>{a.tag}</span></Tooltip>
        </CircleMarker>
      ))}

      {cells.map((c) => (
        <CircleMarker key={`${c.lat}:${c.lng}`} center={[c.lat, c.lng]} radius={6 + Math.min(16, Math.sqrt(c.n) * 3)} pathOptions={{ color: "#fff", weight: 1.5, fillColor: recencyColor(c.last), fillOpacity: 0.8 }}>
          <Tooltip><strong>{c.n} dog sighting{c.n === 1 ? "" : "s"}</strong><br />Last {fmtDateTime(c.last)}<br />{[...c.sources].slice(0, 3).join(", ")}</Tooltip>
        </CircleMarker>
      ))}

      {dogs.map((d, i) => (
        <CircleMarker key={`d${i}`} center={[d.lat, d.lng]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#d1342f", fillOpacity: 1 }}>
          <Tooltip>Possible dog · {(d.score * 100).toFixed(0)}% confidence</Tooltip>
        </CircleMarker>
      ))}

      {cameras.map((c) => (
        <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={7} pathOptions={{ color: "#0e1f38", weight: 2.5, fillColor: "#ffffff", fillOpacity: 1 }}>
          <Tooltip><strong>{c.name}</strong><br />Camera</Tooltip>
        </CircleMarker>
      ))}

      {pin && <CircleMarker center={pin} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#1a9a8a", fillOpacity: 1 }}><Tooltip permanent direction="top">Selected location</Tooltip></CircleMarker>}
    </MapContainer>
  );
}
