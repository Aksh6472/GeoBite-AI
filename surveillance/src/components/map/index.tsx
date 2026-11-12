"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "../ui";

// Leaflet touches `window`; load the map on the client only.
export const DogMap = dynamic(() => import("./DogMap"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> });
export type { Basemap, DogMapProps } from "./DogMap";

export function Legend({ items }: { items: { color: string; label: string; square?: boolean; ring?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={i.square ? "size-3 rounded-[3px]" : "size-2.5 rounded-full"} style={i.ring ? { border: `2.5px solid ${i.color}`, background: "#fff" } : { background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
      className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition ${on ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-700 hover:bg-navy-50"}`}>
      <span className={`size-2 rounded-full ${on ? "bg-teal-100" : "bg-slate-300"}`} />{label}
    </button>
  );
}

export const RECENCY_LEGEND = [
  { color: "#d1342f", label: "Seen < 1 h ago" }, { color: "#f18d13", label: "< 24 h" }, { color: "#e2b203", label: "< 7 days" }, { color: "#8a96a8", label: "Older" },
  { color: "#0e1f38", label: "Camera", ring: true },
];
