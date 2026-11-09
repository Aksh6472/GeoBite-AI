"use client";

import { useState } from "react";
import { FilterBar, focusOf, type Filters } from "@/components/FilterBar";
import { IntelligenceMap, type LayerKey } from "@/components/map";
import { HEAT_COLORS, HEAT_LABELS } from "@/components/map/MapBase";
import { Card, cx, PageHeader } from "@/components/ui";
import { useGeoTree } from "@/lib/hooks";

const OPTIONS: { key: LayerKey; label: string }[] = [
  { key: "bites", label: "Bite heatmap (KDE)" },
  { key: "clusters", label: "Incident clusters (DBSCAN)" },
  { key: "points", label: "Your facility's incidents" },
];

export default function HospitalMap() {
  const [filters, setFilters] = useState<Filters>({});
  const [layers, setLayers] = useState<Set<LayerKey>>(new Set(["bites", "clusters", "points"]));
  const { districts } = useGeoTree();
  const toggle = (k: LayerKey) => setLayers((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <>
      <PageHeader title="GIS incident map" subtitle="Central bite-incident layer shared with veterinary and municipal teams. Other facilities' incidents are shown only as aggregated density and clusters." />
      <FilterBar value={filters} onChange={setFilters} show={["geo", "dates"]} />
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {OPTIONS.map((o) => (
            <button key={o.key} onClick={() => toggle(o.key)} className={cx("rounded-full border px-3 py-1.5 text-[13px] font-medium", layers.has(o.key) ? "border-navy-700 bg-navy-800 text-white" : "border-line bg-white text-navy-700")}>{o.label}</button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted">{HEAT_COLORS.map((c, i) => <span key={c} className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: c }} />{HEAT_LABELS[i]}</span>)}</div>
        </div>
        <IntelligenceMap layers={layers} params={{ ...filters }} focus={focusOf(filters, districts)} className="h-[640px]" />
      </Card>
    </>
  );
}
