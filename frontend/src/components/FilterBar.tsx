"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { useGeoTree, useVocab } from "@/lib/hooks";
import { Button, Input, Select } from "./ui";

export type Filters = {
  district_id?: string; municipality_id?: string; ward_id?: string; date_from?: string; date_to?: string; incident_type?: string; verification_status?: string;
};

/** Shared geographic / temporal filter bar (State > District > Municipality > Ward, date range, type, verification). */
export function FilterBar({ value, onChange, show = ["geo", "dates", "type", "status"] }: { value: Filters; onChange: (f: Filters) => void; show?: ("geo" | "dates" | "type" | "status")[] }) {
  const { districts } = useGeoTree();
  const vocab = useVocab();
  const district = districts.find((d) => String(d.id) === value.district_id);
  const munis = district?.children ?? [];
  const muni = munis.find((m) => String(m.id) === value.municipality_id) ?? (munis.length === 1 ? munis[0] : undefined);
  const wards = muni?.children ?? [];
  const typeOptions = useMemo(() => {
    if (!vocab) return [];
    return [
      ...vocab.injury_category.map((o) => ({ value: o.value, label: `Bite: ${o.label}` })),
      ...vocab.behaviours.map((o) => ({ value: o.value, label: `Behaviour: ${o.label}` })),
    ];
  }, [vocab]);
  const set = (p: Partial<Filters>) => onChange({ ...value, ...p });
  const active = Object.values(value).some(Boolean);

  return (
    <div className="rounded-[14px] border border-line bg-white p-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end gap-2.5">
        <span className="hidden items-center gap-1.5 self-center pr-1 text-[13px] font-medium text-navy-800 lg:flex"><SlidersHorizontal className="size-4" />Filters</span>
        {show.includes("geo") && (
          <>
            <label className="w-full sm:w-auto">
              <span className="sr-only">State</span>
              <Select aria-label="State" options={[{ value: "TN", label: "Tamil Nadu" }]} value="TN" onChange={() => {}} className="sm:w-36" />
            </label>
            <Select aria-label="District" className="w-full sm:w-44" placeholder="All districts" value={value.district_id ?? ""} options={districts.map((d) => ({ value: d.id, label: d.name }))} onChange={(e) => set({ district_id: e.target.value || undefined, municipality_id: undefined, ward_id: undefined })} />
            <Select aria-label="Municipality" className="w-full sm:w-56" placeholder="All municipalities" disabled={!district} value={value.municipality_id ?? ""} options={munis.map((m) => ({ value: m.id, label: m.name }))} onChange={(e) => set({ municipality_id: e.target.value || undefined, ward_id: undefined })} />
            <Select aria-label="Ward" className="w-full sm:w-48" placeholder="All wards" disabled={!district} value={value.ward_id ?? ""} options={wards.map((w) => ({ value: w.id, label: `${w.name} (Ward ${w.ward_number})` }))} onChange={(e) => set({ ward_id: e.target.value || undefined })} />
          </>
        )}
        {show.includes("dates") && (
          <>
            <Input aria-label="From date" type="date" className="w-full sm:w-40" value={value.date_from ?? ""} onChange={(e) => set({ date_from: e.target.value || undefined })} />
            <Input aria-label="To date" type="date" className="w-full sm:w-40" value={value.date_to ?? ""} onChange={(e) => set({ date_to: e.target.value || undefined })} />
          </>
        )}
        {show.includes("type") && <Select aria-label="Incident type" className="w-full sm:w-60" placeholder="All incident types" value={value.incident_type ?? ""} options={typeOptions} onChange={(e) => set({ incident_type: e.target.value || undefined })} />}
        {show.includes("status") && <Select aria-label="Verification status" className="w-full sm:w-48" placeholder="Any verification status" value={value.verification_status ?? ""} options={vocab?.report_status ?? []} onChange={(e) => set({ verification_status: e.target.value || undefined })} />}
        {active && <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-10"><RotateCcw className="size-3.5" />Reset</Button>}
      </div>
    </div>
  );
}

export function focusOf(f: Filters, districts: { id: number; lat: number; lng: number; children?: { id: number; lat: number; lng: number; children?: { id: number; lat: number; lng: number }[] }[] }[]) {
  const d = districts.find((x) => String(x.id) === f.district_id);
  if (!d) return null;
  const ward = d.children?.flatMap((m) => m.children ?? []).find((w) => String(w.id) === f.ward_id);
  if (ward) return { lat: ward.lat, lng: ward.lng, zoom: 15 };
  return { lat: d.lat, lng: d.lng, zoom: 12 };
}
