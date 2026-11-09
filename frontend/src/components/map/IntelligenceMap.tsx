"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { Circle, CircleMarker, GeoJSON, Popup, Rectangle } from "react-leaflet";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { BEHAVIOUR_COLORS, BEHAVIOUR_LABELS, FlyTo, HEAT_COLORS, MapBase, PRIORITY_COLORS, VAX_COLORS, coverageColor } from "./MapBase";

export type LayerKey = "bites" | "clusters" | "points" | "dogs" | "behaviour" | "vaccination" | "onehealth";
type Params = Record<string, string | number | undefined>;

type HeatCell = { lat: number; lng: number; bounds: [[number, number], [number, number]]; density: number; level: number };
type Cluster = { cluster_id: number; lat: number; lng: number; radius_m: number; count: number; persons_affected: number; first_date: string; last_date: string; injury_categories: Record<string, number>; age_groups: Record<string, number>; location_types: Record<string, number>; wards: Record<string, number> };
type BiteLayer = { total: number; heat: HeatCell[]; clusters: Cluster[]; points: { id: number; code: string; lat: number; lng: number; date: string; category: string; ward: string; hospital: string }[] };
type DogFeat = { lat: number; lng: number; observations: number; independent_reports: number; estimated_dogs: number; verified: boolean; last_observed: string; statuses?: string[]; report_codes?: string[] };
type BehFeat = { lat: number; lng: number; groups: Record<string, number>; verified_groups: Record<string, number>; dominant: string; independent_reports: number; verified: boolean; repeated: boolean; last_observed: string; report_codes?: string[] };

const CAT = { cat_i: "Cat I", cat_ii: "Cat II", cat_iii: "Cat III", not_assessed: "Not assessed" } as Record<string, string>;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function top(o: Record<string, number>, n = 3) {
  return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${CAT[k] ?? k.replace(/_/g, " ")} (${v})`).join(", ");
}

export default function IntelligenceMap({ layers, params, behaviourGroup, focus, className = "h-[620px]", onWardClick }: { layers: Set<LayerKey>; params: Params; behaviourGroup?: string; focus?: { lat: number; lng: number; zoom: number } | null; className?: string; onWardClick?: (id: number) => void }) {
  const bites = useApi<BiteLayer>(layers.has("bites") || layers.has("clusters") || layers.has("points") ? "/map/bites" : null, params);
  const dogs = useApi<{ features: DogFeat[] }>(layers.has("dogs") ? "/map/dogs" : null, params);
  const beh = useApi<{ features: BehFeat[] }>(layers.has("behaviour") ? "/map/behaviour" : null, { ...params, group: behaviourGroup });
  const vax = useApi<FeatureCollection>(layers.has("vaccination") ? "/map/vaccination" : null, params);
  const oh = useApi<FeatureCollection>(layers.has("onehealth") ? "/map/onehealth" : null, params);

  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <MapBase className={className} center={[11.4, 78.9]} zoom={7}>
        {focus && <FlyTo center={[focus.lat, focus.lng]} zoom={focus.zoom} />}

        {layers.has("vaccination") && vax.data && (
          <GeoJSON
            key={"vax" + JSON.stringify(params) + vax.data.features.length}
            data={vax.data}
            style={(f?: Feature<Geometry, Record<string, unknown>>) => {
              const p = f?.properties ?? {};
              const st = p.status as string;
              return { color: "#5a6b80", weight: 1, dashArray: st === "unavailable" ? "4 4" : undefined, fillColor: st === "survey_estimate" ? coverageColor(p.coverage as number) : VAX_COLORS[st], fillOpacity: st === "unavailable" ? 0.35 : 0.6 } as PathOptions;
            }}
            onEachFeature={(f: Feature<Geometry, Record<string, unknown>>, l: Layer) => {
              const p = f.properties;
              const status: Record<string, string> = { survey_estimate: "Coverage estimate (documented survey)", confirmed_no_estimate: "Vaccination confirmed, no population survey", unverified: "Unverified record", unavailable: "Vaccination information unavailable" };
              l.bindPopup(`<strong>${esc(p.ward)}</strong> · Ward ${esc(p.ward_number)}<br/>${esc(p.district)}<br/><br/>${status[p.status as string]}<br/>${p.coverage != null ? `Coverage: <strong>${fmtPct(p.coverage as number)}</strong><br/>` : ""}Dogs vaccinated (confirmed): ${fmtNum(p.dogs_vaccinated as number)}<br/>${p.latest ? `Latest record: ${fmtDate(p.latest as string)}` : ""}`);
            }}
          />
        )}

        {layers.has("onehealth") && oh.data && (
          <GeoJSON
            key={"oh" + JSON.stringify(params) + oh.data.features.length}
            data={oh.data}
            style={(f?: Feature<Geometry, Record<string, unknown>>) => {
              const p = f?.properties ?? {};
              const hot = String(p.gi_class ?? "").startsWith("hot");
              return { color: hot ? "#7f1d1d" : "#334155", weight: hot ? 2.5 : 1, fillColor: PRIORITY_COLORS[p.priority as string], fillOpacity: 0.55 } as PathOptions;
            }}
            onEachFeature={(f: Feature<Geometry, Record<string, unknown>>, l: Layer) => {
              const p = f.properties as Record<string, unknown> & { contributions: Record<string, number>; data_gaps: string[] };
              const rows = Object.entries(p.contributions).map(([k, v]) => `<tr><td style="padding-right:8px">${esc(k.replace(/_/g, " "))}</td><td style="text-align:right"><strong>${v}</strong></td></tr>`).join("");
              l.bindPopup(`<strong>${esc(p.ward)}</strong> · ${esc(p.district)}<br/>Investigation Priority Index: <strong>${p.index}</strong> (${p.priority})<br/>Getis-Ord Gi*: z = ${p.gi_z ?? "-"} (${String(p.gi_class).replace(/_/g, " ")})<br/><table style="margin-top:6px;font-size:12px">${rows}</table><div style="margin-top:6px;color:#5a6b80">Bites (90 d): ${p.bites} · Concerning reports: ${p.concerning_reports} · Observed dogs: ${p.observed_dogs}${p.data_gaps.length ? `<br/>Data gaps: ${esc(p.data_gaps.join(", "))}` : ""}</div>`);
              if (onWardClick) l.on("click", () => onWardClick(p.id as number));
            }}
          />
        )}

        {layers.has("bites") && bites.data?.heat.map((c, i) => (
          <Rectangle key={"h" + i} bounds={c.bounds} pathOptions={{ stroke: false, fillColor: HEAT_COLORS[c.level - 1], fillOpacity: 0.18 + c.level * 0.1 }} interactive={false} />
        ))}

        {layers.has("clusters") && bites.data?.clusters.map((c) => (
          <Circle key={"c" + c.cluster_id} center={[c.lat, c.lng]} radius={c.radius_m} pathOptions={{ color: "#0e1f38", weight: 2, dashArray: "5 4", fillColor: "#0e1f38", fillOpacity: 0.05 }}>
            <Popup>
              <div className="min-w-[220px]">
                <p className="font-semibold">Bite cluster #{c.cluster_id} (DBSCAN)</p>
                <p className="mt-1"><strong>{c.count}</strong> incidents · {c.persons_affected} persons affected</p>
                <p>{fmtDate(c.first_date)} to {fmtDate(c.last_date)}</p>
                <p className="mt-1">Wards: {top(c.wards)}</p>
                <p>Injury: {top(c.injury_categories)}</p>
                <p>Age: {top(c.age_groups)}</p>
                <p>Setting: {top(c.location_types)}</p>
                <p className="mt-1 text-[11px] text-slate-500">Aggregated statistics. No patient-level data shown.</p>
              </div>
            </Popup>
          </Circle>
        ))}

        {layers.has("points") && bites.data?.points.map((p) => (
          <CircleMarker key={"p" + p.id} center={[p.lat, p.lng]} radius={3} pathOptions={{ color: "#0e1f38", weight: 1, fillColor: p.category === "cat_iii" ? "#c0392b" : "#34598c", fillOpacity: 0.85 }}>
            <Popup><strong>{p.code}</strong><br />{fmtDate(p.date)} · {CAT[p.category]}<br />{p.ward} · {p.hospital}</Popup>
          </CircleMarker>
        ))}

        {layers.has("dogs") && dogs.data?.features.map((f, i) => (
          <CircleMarker key={"d" + i} center={[f.lat, f.lng]} radius={Math.min(22, 4 + Math.sqrt(f.estimated_dogs) * 2.4)} pathOptions={{ color: "#0f665a", weight: f.verified ? 2 : 1.5, dashArray: f.verified ? undefined : "3 3", fillColor: "#1a9a8a", fillOpacity: f.verified ? 0.55 : 0.25 }}>
            <Popup>
              <div className="min-w-[200px]">
                <p className="font-semibold">Dog observation {f.verified ? "(includes verified)" : "(unverified)"}</p>
                <p className="mt-1">Estimated dogs: <strong>{f.estimated_dogs}</strong> <span className="text-slate-500">(median of reports)</span></p>
                <p>{f.observations} reports · {f.independent_reports} independent</p>
                <p>Last observed: {fmtDate(f.last_observed)}</p>
                {f.statuses && <p>Status: {f.statuses.join(", ").replace(/_/g, " ")}</p>}
                {f.report_codes && <p className="mt-1 font-mono text-[11px]">{f.report_codes.slice(0, 4).join(" ")}</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {layers.has("behaviour") && beh.data?.features.map((f, i) => (
          <CircleMarker key={"b" + i} center={[f.lat, f.lng]} radius={f.repeated ? 9 : 6} pathOptions={{ color: f.verified ? "#0e1f38" : BEHAVIOUR_COLORS[f.dominant], weight: f.verified ? 2.5 : 1.5, dashArray: f.verified ? undefined : "3 3", fillColor: BEHAVIOUR_COLORS[f.dominant], fillOpacity: 0.7 }}>
            <Popup>
              <div className="min-w-[210px]">
                <p className="font-semibold">{f.verified ? "Verified observation" : "Unverified community report"}</p>
                {Object.entries(f.groups).map(([g, n]) => <p key={g}>{BEHAVIOUR_LABELS[g]}: <strong>{n}</strong>{f.verified_groups[g] ? ` (${f.verified_groups[g]} verified)` : ""}</p>)}
                <p className="mt-1">{f.independent_reports} independent report(s){f.repeated ? " · repeated" : ""}</p>
                <p>Last observed: {fmtDate(f.last_observed)}</p>
                <p className="mt-1 text-[11px] text-slate-500">Reported observations only. Not a classification of any dog as dangerous.</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapBase>

      {[bites, dogs, beh, vax, oh].some((x) => x.loading) && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-navy-700 shadow">Updating layers…</div>
      )}
      {[bites, dogs, beh, vax, oh].find((x) => x.error) && (
        <div className="absolute left-3 right-3 top-3 z-[500] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 shadow">{[bites, dogs, beh, vax, oh].find((x) => x.error)!.error!.message}</div>
      )}
    </div>
  );
}
