"use client";

import { Activity, Dog, Layers, MessageSquareWarning, Sigma, Syringe } from "lucide-react";
import { useState } from "react";
import { FilterBar, focusOf, type Filters } from "@/components/FilterBar";
import { IntelligenceMap, type LayerKey } from "@/components/map";
import { BEHAVIOUR_COLORS, BEHAVIOUR_LABELS, HEAT_COLORS, HEAT_LABELS, PRIORITY_COLORS } from "@/components/map/MapBase";
import { Card, cx, PageHeader, Select } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi, useGeoTree } from "@/lib/hooks";

const LAYERS: { key: LayerKey; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "bites", label: "1. Bite-incident heatmap", desc: "Kernel density of hospital-reported bites", icon: Activity },
  { key: "clusters", label: "Bite clusters (DBSCAN)", desc: "Click a cluster for aggregated statistics", icon: Sigma },
  { key: "points", label: "Individual incidents", desc: "Clinical administrators only", icon: Activity },
  { key: "dogs", label: "2. Stray-dog observations", desc: "De-duplicated community observation groups", icon: Dog },
  { key: "behaviour", label: "3. Behaviour observations", desc: "Repeated / verified reports highlighted", icon: MessageSquareWarning },
  { key: "vaccination", label: "4. Vaccination information", desc: "Verified coverage by ward", icon: Syringe },
  { key: "onehealth", label: "5. One Health hotspot index", desc: "Combined, explainable priority score", icon: Layers },
];

type OH = { weights: Record<string, number>; explanation: Record<string, string>; note: string };

export default function ConsoleMap() {
  const { user } = useAuth();
  const { districts } = useGeoTree();
  const [filters, setFilters] = useState<Filters>(user?.district_id ? { district_id: String(user.district_id) } : {});
  const [layers, setLayers] = useState<Set<LayerKey>>(new Set(["bites", "clusters"]));
  const [group, setGroup] = useState("");
  const clinical = user?.role === "super_admin" || user?.role === "medical_admin";
  const oh = useApi<OH>(layers.has("onehealth") ? "/map/onehealth" : null, { ...filters });
  const toggle = (k: LayerKey) => setLayers((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <>
      <PageHeader title="Geospatial intelligence map" subtitle="Five independently selectable layers built from the shared database. Bite data is aggregated for non-clinical roles; community points are cluster centroids." />
      <FilterBar value={filters} onChange={setFilters} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[300px_1fr]">
        <Card className="self-start p-3">
          <p className="px-2 pb-2 pt-1 text-[13px] font-semibold text-navy-900">Map layers</p>
          <ul className="space-y-1">
            {LAYERS.filter((l) => l.key !== "points" || clinical).map((l) => {
              const on = layers.has(l.key);
              return (
                <li key={l.key}>
                  <label className={cx("flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2", on ? "bg-navy-50" : "hover:bg-canvas")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(l.key)} className="mt-0.5 size-4 accent-navy-700" />
                    <span><span className="block text-[13px] font-medium text-ink">{l.label}</span><span className="text-xs text-muted">{l.desc}</span></span>
                  </label>
                  {l.key === "behaviour" && on && (
                    <div className="px-2.5 pb-2 pl-9">
                      <Select aria-label="Behaviour group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="All behaviour types" options={Object.entries(BEHAVIOUR_LABELS).map(([value, label]) => ({ value, label }))} className="h-9 text-[13px]" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 space-y-4 border-t border-line px-2 pt-3 text-xs text-muted">
            {layers.has("bites") && <div><p className="mb-1.5 font-medium text-navy-900">Bite concentration</p><div className="flex flex-wrap gap-2">{HEAT_COLORS.map((c, i) => <span key={c} className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: c }} />{HEAT_LABELS[i]}</span>)}</div></div>}
            {layers.has("behaviour") && <div><p className="mb-1.5 font-medium text-navy-900">Behaviour (dashed = unverified)</p><div className="grid gap-1">{Object.entries(BEHAVIOUR_LABELS).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: BEHAVIOUR_COLORS[k] }} />{l}</span>)}</div></div>}
            {layers.has("vaccination") && <div><p className="mb-1.5 font-medium text-navy-900">Vaccination</p><div className="grid gap-1">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-sm" style={{ background: "linear-gradient(90deg,#cfeee9,#0f665a)" }} />Survey coverage 0 to 70%+</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#7fb8ad]" />Confirmed, no survey estimate</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-300" />Unverified record</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-slate-400 bg-slate-100" />Information unavailable</span>
            </div></div>}
            {layers.has("onehealth") && (
              <div>
                <p className="mb-1.5 font-medium text-navy-900">Investigation Priority Index</p>
                <div className="flex flex-wrap gap-2">{Object.entries(PRIORITY_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1 capitalize"><span className="size-3 rounded-sm" style={{ background: c }} />{k}</span>)}</div>
                <p className="mt-1">Thick red outline: Getis-Ord Gi* significant hot spot.</p>
                {oh.data && (
                  <ul className="mt-2 space-y-1.5">
                    {Object.entries(oh.data.weights).map(([k, wt]) => <li key={k}><span className="font-medium text-navy-800">{Math.round(wt * 100)}% {k.replace(/_/g, " ")}</span>: {oh.data!.explanation[k]}</li>)}
                  </ul>
                )}
                <p className="mt-2 text-[11.5px]">{oh.data?.note}</p>
              </div>
            )}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <IntelligenceMap layers={layers} params={{ ...filters }} behaviourGroup={group || undefined} focus={focusOf(filters, districts)} className="h-[720px]" />
        </Card>
      </div>
    </>
  );
}
