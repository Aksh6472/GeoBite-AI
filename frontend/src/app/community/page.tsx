"use client";

import { CalendarCheck2, Dog, Hourglass, MapPinned, Megaphone, Repeat2 } from "lucide-react";
import { useState } from "react";
import { BarList, CHART } from "@/components/charts";
import { FilterBar, type Filters } from "@/components/FilterBar";
import { PublicMap } from "@/components/map";
import { BEHAVIOUR_COLORS, BEHAVIOUR_LABELS } from "@/components/map/MapBase";
import { Card, CardHeader, ErrorBanner, LinkButton, Skeleton, Stat, SyntheticNotice, Tabs } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type Dash = {
  total_reports: number; dogs_reported_raw: number; dogs_estimated_dedup: number; observation_locations: number; reports_today: number; awaiting_verification: number; verified: number;
  repeated_concern_areas: { ward: string; municipality: string; independent_reports: number }[];
  by_behaviour: { key: string; name: string; count: number }[]; by_status: { key: string; name: string; count: number }[];
};

export default function CommunityDashboard() {
  const [filters, setFilters] = useState<Filters>({});
  const [mode, setMode] = useState<"dogs" | "behaviour">("dogs");
  const { data: d, error, loading } = useApi<Dash>("/community/dashboard", { ...filters });
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900 md:text-3xl">Community dog observations</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">What residents across the pilot districts are reporting. Figures are aggregated; no reporter details or exact home locations are shown.</p>
        </div>
        <LinkButton href="/community/report" variant="teal" size="lg"><Dog className="size-4" />Report dogs in your area</LinkButton>
      </div>
      <div className="mb-5"><SyntheticNotice /></div>
      <FilterBar value={filters} onChange={setFilters} show={["geo", "dates", "status"]} />
      <ErrorBanner error={error} />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Community reports" value={fmtNum(d?.total_reports)} icon={Megaphone} loading={loading && !d} />
        <Stat label="Dogs reported" value={fmtNum(d?.dogs_estimated_dedup)} icon={Dog} tone="teal" loading={loading && !d} hint={d ? `${fmtNum(d.dogs_reported_raw)} before de-duplication` : undefined} />
        <Stat label="Locations observed" value={fmtNum(d?.observation_locations)} icon={MapPinned} tone="sage" loading={loading && !d} />
        <Stat label="Reports today" value={fmtNum(d?.reports_today)} icon={CalendarCheck2} loading={loading && !d} />
        <Stat label="Awaiting verification" value={fmtNum(d?.awaiting_verification)} icon={Hourglass} tone="orange" loading={loading && !d} />
        <Stat label="Repeated-concern areas" value={fmtNum(d?.repeated_concern_areas.length)} icon={Repeat2} tone="red" loading={loading && !d} hint="2+ independent reports" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
            <Tabs value={mode} onChange={setMode} items={[{ value: "dogs", label: "Dog observations" }, { value: "behaviour", label: "Reported behaviour" }]} />
            <p className="text-xs text-muted">Dashed outline: unverified · solid: includes verified</p>
          </div>
          <PublicMap mode={mode} params={{ ...filters }} className="h-[460px]" />
          {mode === "behaviour" && (
            <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
              {Object.entries(BEHAVIOUR_LABELS).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: BEHAVIOUR_COLORS[k] }} />{l}</span>)}
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Areas with repeated concerning reports" subtitle="Independent reports of chasing, threatening behaviour or bites. Awaiting or under official review." />
            <div className="p-5">
              {!d ? <Skeleton className="h-28" /> : d.repeated_concern_areas.length === 0 ? <p className="text-sm text-muted">No repeated reports for this selection.</p> : (
                <BarList items={d.repeated_concern_areas.map((a) => ({ name: a.ward, sub: a.municipality.replace(" City Municipal Corporation", "").replace("Greater ", ""), count: a.independent_reports }))} color={CHART.orange} />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Verification status" />
            <div className="p-5">{d ? <BarList items={d.by_status} color={CHART.sage} /> : <Skeleton className="h-24" />}</div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Observed behaviour" subtitle="As reported by residents. These are observations, not assessments of any dog." />
        <div className="grid gap-x-10 gap-y-2.5 p-5 md:grid-cols-2">{d ? <><BarList items={d.by_behaviour.slice(0, 6)} color={CHART.teal} max={Math.max(...d.by_behaviour.map((b) => b.count))} /><BarList items={d.by_behaviour.slice(6)} color={CHART.teal} max={Math.max(...d.by_behaviour.map((b) => b.count))} /></> : <Skeleton className="h-40" />}</div>
      </Card>
    </>
  );
}
