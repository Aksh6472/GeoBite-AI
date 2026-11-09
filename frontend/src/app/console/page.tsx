"use client";

import { Activity, BellRing, ClipboardCheck, Dog, Download, Flame, Map as MapIcon, Syringe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarList, CHART, TrendChart, VBar } from "@/components/charts";
import { FilterBar, type Filters } from "@/components/FilterBar";
import { Badge, Card, CardHeader, ErrorBanner, LinkButton, PageHeader, Skeleton, Stat, STATUS_TONE, SyntheticNotice, Table } from "@/components/ui";
import { downloadUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type Summary = {
  bite_incidents: number; persons_affected: number; dog_sightings: number; estimated_observed_dogs: number; raw_reported_dogs: number; observation_locations: number;
  hotspots: { dbscan_clusters: number; gi_hot_wards: number }; reports_requiring_verification: number;
  vaccination: { coverage: number | null; wards_with_survey: number; wards_total: number; note: string }; open_alerts: number; open_alerts_high: number; synthetic_data_present: boolean;
};
type Breakdowns = Record<string, { key: string; name: string; count: number }[]> & { by_district: { name: string; bites: number; community_reports: number }[] };
type WardRow = { id: number; ward: string; ward_number: number; district: string; bites: number; bite_rate: number; category_iii: number; observed_dogs: number; concerning_reports: number; vax_status: string; vax_coverage: number | null; gi_z: number | null; gi_class: string };
type Alert = { id: number; alert_code: string; title: string; severity: string; status: string; status_label: string; district: string; created_at: string; alert_type_label: string };

const GI_LABEL: Record<string, string> = { hot_99: "Hot spot 99%", hot_95: "Hot spot 95%", hot_90: "Hot spot 90%", cold_99: "Cold 99%", cold_95: "Cold 95%", cold_90: "Cold 90%", not_significant: "Not significant", not_computed: "-" };

export default function ConsoleDashboard() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<Filters>(user?.district_id ? { district_id: String(user.district_id) } : {});
  const p = { ...filters };
  const s = useApi<Summary>("/dashboard/summary", p);
  const t = useApi<{ month: string; bites: number; community_reports: number; cat_iii: number; interventions_completed: number }[]>("/dashboard/trends", p);
  const b = useApi<Breakdowns>("/dashboard/breakdowns", p);
  const w = useApi<WardRow[]>("/dashboard/wards", p);
  const a = useApi<{ items: Alert[] }>("/alerts", { limit: 6, district_id: filters.district_id });
  const d = s.data;

  return (
    <>
      <PageHeader
        title="One Health intelligence dashboard"
        subtitle="Hospital bite surveillance and community observations from the shared GeoBite-AI database. Indicators cover the last 12 months unless a date range is set."
        actions={<><a href={downloadUrl("/analytics/export/wards.csv", p)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"><Download className="size-4" />Ward indicators CSV</a><LinkButton href="/console/map"><MapIcon className="size-4" />Open GIS map</LinkButton></>}
      />
      {d?.synthetic_data_present && <div className="mb-4"><SyntheticNotice /></div>}
      <FilterBar value={filters} onChange={setFilters} />
      <div className="mt-2"><ErrorBanner error={s.error} onRetry={s.reload} /></div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Reported bite incidents" value={fmtNum(d?.bite_incidents)} icon={Activity} loading={!d} hint={d ? `${fmtNum(d.persons_affected)} persons affected` : undefined} />
        <Stat label="Community dog sightings" value={fmtNum(d?.dog_sightings)} icon={Dog} tone="teal" loading={!d} hint={d ? `${fmtNum(d.observation_locations)} distinct locations` : undefined} />
        <Stat label="Estimated observed dogs" value={fmtNum(d?.estimated_observed_dogs)} icon={Dog} tone="sage" loading={!d} hint={d ? `de-duplicated from ${fmtNum(d.raw_reported_dogs)} reported` : undefined} />
        <Stat label="Geographical hotspots" value={fmtNum(d?.hotspots.dbscan_clusters)} icon={Flame} tone="orange" loading={!d} hint={d ? `DBSCAN clusters · ${d.hotspots.gi_hot_wards} Gi* hot wards` : undefined} />
        <Stat label="Reports requiring verification" value={fmtNum(d?.reports_requiring_verification)} icon={ClipboardCheck} tone="orange" loading={!d} hint={<Link href="/console/moderation" className="font-medium text-teal-700">Open queue</Link>} />
        <Stat label="Vaccination coverage" value={d ? (d.vaccination.coverage === null ? "No data" : fmtPct(d.vaccination.coverage)) : ""} icon={Syringe} tone="teal" loading={!d} hint={d ? `verified surveys in ${d.vaccination.wards_with_survey} of ${d.vaccination.wards_total} wards` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Monthly trend" subtitle="Hospital-reported bites against community reports and completed interventions" />
          <div className="p-4">{t.data ? <TrendChart data={t.data} series={[{ key: "bites", label: "Bite incidents", color: CHART.navy }, { key: "community_reports", label: "Community reports", color: CHART.teal, type: "line" }, { key: "cat_iii", label: "Category III", color: CHART.red, type: "line" }]} height={280} /> : <Skeleton className="h-[280px]" />}</div>
        </Card>
        <Card>
          <CardHeader title="Open alerts" icon={BellRing} subtitle={d ? `${d.open_alerts} open · ${d.open_alerts_high} high severity` : undefined} action={<Link href="/console/alerts" className="text-[13px] font-medium text-teal-700">View all</Link>} />
          <ul className="divide-y divide-line">
            {!a.data && <li className="p-4"><Skeleton className="h-40" /></li>}
            {a.data?.items.length === 0 && <li className="p-6 text-center text-sm text-muted">No open alerts</li>}
            {a.data?.items.map((x) => (
              <li key={x.id}>
                <Link href={`/console/alerts/${x.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-canvas">
                  <Badge tone={STATUS_TONE[x.severity]}>{x.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{x.title}</p>
                    <p className="text-xs text-muted">{x.alert_code} · {x.district} · {fmtDateTime(x.created_at)}</p>
                  </div>
                  <Badge tone={STATUS_TONE[x.status]}>{x.status_label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="District comparison" />
          <div className="p-4">{b.data ? <VBar data={b.data.by_district} xKey="name" bars={[{ key: "bites", label: "Bite incidents", color: CHART.navy }, { key: "community_reports", label: "Community reports", color: CHART.teal }]} height={260} /> : <Skeleton className="h-[260px]" />}</div>
        </Card>
        <Card>
          <CardHeader title="Bite setting" subtitle="Location type at the time of bite" />
          <div className="p-5">{b.data ? <BarList items={b.data.location_type} /> : <Skeleton className="h-40" />}</div>
        </Card>
        <Card>
          <CardHeader title="Injury category" />
          <div className="p-5">{b.data ? <BarList items={b.data.injury_category} color={CHART.red} /> : <Skeleton className="h-32" />}</div>
        </Card>
        <Card>
          <CardHeader title="PEP status" subtitle="As recorded by the reporting facility" />
          <div className="p-5">{b.data ? <BarList items={b.data.pep_status} color={CHART.teal} /> : <Skeleton className="h-32" />}</div>
        </Card>
        <Card>
          <CardHeader title="Community behaviour reports" />
          <div className="p-5">{b.data ? <BarList items={[...b.data.behaviour].sort((x, y) => y.count - x.count).slice(0, 7)} color={CHART.orange} /> : <Skeleton className="h-32" />}</div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Ward indicators (last 90 days)" subtitle="Ranked by bite incidents. Getis-Ord Gi* tests whether a ward and its neighbours have significantly high counts." />
        {!w.data ? <div className="p-4"><Skeleton className="h-64" /></div> : (
          <Table head={["Ward", "District", "Bites", "per 10k", "Cat III", "Observed dogs", "Concerning reports", "Vaccination", "Gi* z", "Hot spot"]}>
            {w.data.slice(0, 15).map((r) => (
              <tr key={r.id} className="hover:bg-canvas/70">
                <td className="px-4 py-2.5 font-medium">{r.ward}<span className="ml-1 text-xs text-muted">W{r.ward_number}</span></td>
                <td className="px-4 py-2.5 text-muted">{r.district}</td>
                <td className="px-4 py-2.5 font-mono">{r.bites}</td>
                <td className="px-4 py-2.5 font-mono">{r.bite_rate}</td>
                <td className="px-4 py-2.5 font-mono">{r.category_iii}</td>
                <td className="px-4 py-2.5 font-mono">{r.observed_dogs}</td>
                <td className="px-4 py-2.5 font-mono">{r.concerning_reports}</td>
                <td className="px-4 py-2.5">{r.vax_status === "survey_estimate" ? fmtPct(r.vax_coverage) : <span className="text-muted">{r.vax_status === "unavailable" ? "Unavailable" : r.vax_status.replace(/_/g, " ")}</span>}</td>
                <td className="px-4 py-2.5 font-mono">{r.gi_z ?? "-"}</td>
                <td className="px-4 py-2.5"><Badge tone={r.gi_class.startsWith("hot") ? "red" : r.gi_class.startsWith("cold") ? "navy" : "gray"}>{GI_LABEL[r.gi_class]}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
