"use client";

import { PublicMap } from "@/components/map";
import { useApi } from "@/lib/hooks";
import { fmtNum } from "@/lib/format";

export function LandingMap() {
  return <PublicMap className="h-[340px] md:h-[420px]" scrollWheelZoom={false} />;
}

type Dash = { total_reports: number; dogs_estimated_dedup: number; observation_locations: number; awaiting_verification: number; verified: number };

export function LiveNumbers() {
  const { data } = useApi<Dash>("/community/dashboard");
  const pub = useApi<{ wards: unknown[] }>("/map/public/bites");
  const items = [
    { v: pub.data?.wards.length, l: "wards monitored across 5 districts" },
    { v: data?.total_reports, l: "community observations in the last year" },
    { v: data?.dogs_estimated_dedup, l: "dogs observed after de-duplication" },
    { v: data?.verified, l: "observations verified by field officers" },
  ];
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 py-8 md:grid-cols-4 md:px-6">
        {items.map((i) => (
          <div key={i.l} className="pr-4">
            <p className="font-mono text-3xl font-semibold tracking-tight text-navy-900">{i.v === undefined ? <span className="inline-block h-8 w-20 animate-pulse rounded bg-navy-50" /> : fmtNum(i.v)}</p>
            <p className="mt-1 text-[13px] text-muted">{i.l}</p>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-6 text-xs text-muted md:px-6">Live figures from the demonstration database (synthetic data).</p>
    </section>
  );
}
