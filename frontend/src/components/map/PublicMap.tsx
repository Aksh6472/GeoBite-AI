"use client";

import { CircleMarker, Popup } from "react-leaflet";
import { useApi } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { BEHAVIOUR_COLORS, BEHAVIOUR_LABELS, MapBase } from "./MapBase";

type DogFeat = { lat: number; lng: number; observations: number; estimated_dogs: number; verified: boolean; last_observed: string; independent_reports: number };
type BehFeat = { lat: number; lng: number; groups: Record<string, number>; dominant: string; verified: boolean; repeated: boolean; last_observed: string };

/** Public, privacy-preserving map: community observations aggregated to a ~550 m grid. */
export default function PublicMap({ mode = "dogs", className = "h-[420px]", params, scrollWheelZoom = true }: { mode?: "dogs" | "behaviour"; className?: string; params?: Record<string, string | number | undefined>; scrollWheelZoom?: boolean }) {
  const dogs = useApi<{ features: DogFeat[] }>(mode === "dogs" ? "/map/dogs" : null, params);
  const beh = useApi<{ features: BehFeat[] }>(mode === "behaviour" ? "/map/behaviour" : null, params);
  return (
    <MapBase className={className} center={[11.5, 79.0]} zoom={7} scrollWheelZoom={scrollWheelZoom}>
      {mode === "dogs" && dogs.data?.features.map((f, i) => (
        <CircleMarker key={i} center={[f.lat, f.lng]} radius={Math.min(20, 4 + Math.sqrt(f.estimated_dogs) * 2.2)} pathOptions={{ color: "#0f665a", weight: 1.5, dashArray: f.verified ? undefined : "3 3", fillColor: "#1a9a8a", fillOpacity: f.verified ? 0.55 : 0.28 }}>
          <Popup>
            <strong>About {f.estimated_dogs} dogs observed</strong><br />
            {f.observations} report(s) in this ~500 m area<br />
            {f.verified ? "Includes verified observations" : "Unverified community reports"}<br />
            Last observed {fmtDate(f.last_observed)}
          </Popup>
        </CircleMarker>
      ))}
      {mode === "behaviour" && beh.data?.features.map((f, i) => (
        <CircleMarker key={i} center={[f.lat, f.lng]} radius={f.repeated ? 8 : 5} pathOptions={{ color: BEHAVIOUR_COLORS[f.dominant], weight: 1.5, dashArray: f.verified ? undefined : "3 3", fillColor: BEHAVIOUR_COLORS[f.dominant], fillOpacity: 0.6 }}>
          <Popup>
            {Object.entries(f.groups).map(([g, n]) => <div key={g}>{BEHAVIOUR_LABELS[g]}: {n}</div>)}
            <div style={{ marginTop: 4 }}>{f.verified ? "Includes verified reports" : "Unverified reports"} · {fmtDate(f.last_observed)}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapBase>
  );
}
