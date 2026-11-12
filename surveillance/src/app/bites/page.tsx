"use client";

import { Cctv, Dog, Info, ShieldAlert, Siren } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarList, CHART } from "@/components/charts";
import { DogMap, Legend, Toggle } from "@/components/map";
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat, Table } from "@/components/ui";
import { type BiteData, fetchBites, type Level, rankWards, WARD_RADIUS_M } from "@/lib/bites";
import { fmtDate } from "@/lib/format";
import { inWindow, WINDOW_LABEL, type WindowKey } from "@/lib/geo";
import { useCameras, useScans, useSightings } from "@/lib/store";

const LEVEL_TONE: Record<Level, string> = { High: "red", Medium: "orange", Low: "yellow" };
const DISTRICT_VIEW: Record<string, { at: [number, number]; zoom: number }> = {
  Chennai: { at: [13.06, 80.25], zoom: 12 }, Salem: { at: [11.66, 78.145], zoom: 13 }, Vellore: { at: [12.93, 79.145], zoom: 13 },
  Madurai: { at: [9.92, 78.115], zoom: 12 }, Tiruchirappalli: { at: [10.81, 78.705], zoom: 12 },
};

export default function BitesPage() {
  const all = useSightings();
  const cams = useCameras();
  const allScans = useScans();
  const [data, setData] = useState<BiteData | null>(null);
  const [win, setWin] = useState<WindowKey>("30d");
  const [district, setDistrict] = useState("");
  const [showBites, setShowBites] = useState(true);
  const [showDogs, setShowDogs] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchBites(ctl.signal).then(setData).catch(() => {});
    return () => ctl.abort();
  }, []);

  const rows = useMemo(() => all.filter((s) => inWindow(s.at, win)), [all, win]);
  const scans = useMemo(() => allScans.filter((s) => inWindow(s.at, win)), [allScans, win]);
  const ranked = useMemo(() => (data ? rankWards(data.wards, rows, scans, cams, data.threshold) : []), [data, rows, scans, cams]);
  const districts = useMemo(() => [...new Set(ranked.map((r) => r.district))], [ranked]);
  const scoped = district ? ranked.filter((r) => r.district === district) : ranked;

  const totalBites = scoped.reduce((s, r) => s + (r.bites ?? 0), 0);
  const high = scoped.filter((r) => r.level === "High");
  const blind = scoped.filter((r) => (r.bites ?? 0) > 0 && !r.cameras && !r.scans);
  const byBites = [...scoped].sort((a, b) => (b.bites ?? 0) - (a.bites ?? 0)).slice(0, 8);
  const byDogs = [...scoped].filter((r) => r.dogsHigh > 0).sort((a, b) => b.dogsLow - a.dogsLow || b.dogsHigh - a.dogsHigh).slice(0, 8);
  const view = district ? DISTRICT_VIEW[district] : null;
  const sel = selected ? ranked.find((r) => r.ward === selected) : null;

  return (
    <>
      <PageHeader
        title="Bites & dogs"
        subtitle="Where dog bites are reported, where StrayWatch has seen the most dogs, and the wards where both are high. Use it to decide where to vaccinate, sterilise and place cameras first."
        actions={<>
          <select aria-label="District" value={district} onChange={(e) => { setDistrict(e.target.value); setSelected(null); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm">
            <option value="">All districts</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="Dog sightings window" value={win} onChange={(e) => setWin(e.target.value as WindowKey)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm">
            {(Object.keys(WINDOW_LABEL) as WindowKey[]).map((k) => <option key={k} value={k}>Dogs: {WINDOW_LABEL[k].toLowerCase()}</option>)}
          </select>
        </>}
      />

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 text-[13px] text-navy-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Bite counts</strong> come from the GeoBite-AI platform: ward totals of reported bites, with wards under {data?.threshold ?? 3} bites hidden for privacy.
          GeoBite-AI currently holds <strong>synthetic demonstration data</strong>.{" "}
          {data ? (data.source === "live" ? "Loaded live just now." : `GeoBite-AI could not be reached, so a copy from ${fmtDate(data.asOf)} is shown.`) : "Loading…"}{" "}
          <strong>Dogs</strong> are StrayWatch sightings within {WARD_RADIUS_M / 1000} km of each ward centre.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reported bites" value={data ? totalBites.toLocaleString("en-IN") : "…"} icon={Siren} tone="red" hint={`${scoped.length} wards`} loading={!data} />
        <Stat label="High-risk wards" value={data ? high.length : "…"} icon={ShieldAlert} tone="orange" hint={high.slice(0, 2).map((r) => r.ward).join(", ") || "none"} loading={!data} />
        <Stat label="Most dogs at once" value={byDogs[0] ? byDogs[0].dogsLow : "-"} icon={Dog} tone="teal" hint={byDogs[0] ? `${byDogs[0].ward} · ${byDogs[0].sightings} sightings` : "no sightings yet"} loading={!data} />
        <Stat label="Bite wards with no camera" value={data ? blind.length : "…"} icon={Cctv} hint="dog numbers unknown there" loading={!data} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Toggle on={showBites} onChange={setShowBites} label="Dog bites" />
            <Toggle on={showDogs} onChange={setShowDogs} label="Dogs seen" />
            <p className="ml-auto text-xs text-muted">Click a ward circle for its details</p>
          </div>
          {data ? (
            <DogMap height="h-[540px]" center={[11.3, 79.0]} zoom={7}
              bites={showBites ? scoped.map((r) => ({ ...r, level: r.level })) : []}
              sightings={showDogs ? rows : []} cameras={showDogs ? cams : []}
              onWard={setSelected}
              focus={sel ? { at: [sel.lat, sel.lng], zoom: 14, key: sel.ward } : view ? { at: view.at, zoom: view.zoom, key: district } : null} />
          ) : <Skeleton className="h-[540px] w-full rounded-none" />}
          <div className="border-t border-line px-4 py-2.5">
            <Legend items={[{ color: "#c0392b", label: "High risk ward (circle size = bites)" }, { color: "#d9701c", label: "Medium" }, { color: "#e2b203", label: "Low" }, { color: "#d1342f", label: "Dog sightings (dots)", square: true }, { color: "#0e1f38", label: "Camera", ring: true }]} />
          </div>
        </Card>

        <div className="grid content-start gap-6">
          {sel && (
            <Card>
              <CardHeader title={sel.ward} subtitle={`${sel.district} · within ${WARD_RADIUS_M / 1000} km of the ward centre`} action={<Badge tone={LEVEL_TONE[sel.level]}>{sel.level} risk</Badge>} />
              <dl className="grid grid-cols-2 gap-px bg-line text-[13px] sm:grid-cols-3">
                {[["Dog bites", sel.suppressed ? `< ${data?.threshold ?? 3}` : sel.bites ?? 0], ["Most dogs at once", sel.dogsHigh ? sel.dogsLow : "none seen"], ["Dog sightings", sel.sightings], ["Cameras", sel.cameras], ["Image scans", sel.scans]].map(([k, v]) => (
                  <div key={String(k)} className="bg-white px-4 py-3"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-mono text-[17px] font-semibold text-navy-900">{v}</dd></div>
                ))}
              </dl>
              {sel.note && <p className="border-t border-line px-4 py-3 text-[13px] text-ink">{sel.note}.</p>}
            </Card>
          )}
          <Card>
            <CardHeader title="Where bites are highest" subtitle="Reported dog bites per ward" icon={Siren} />
            <div className="p-5"><BarList items={byBites.map((r) => ({ name: r.ward, sub: r.district, count: r.bites ?? 0 }))} color={CHART.red} empty="No bite data" /></div>
          </Card>
          <Card>
            <CardHeader title="Where dogs are most" subtitle={`Most dogs seen at the same time (certainly different dogs), ${WINDOW_LABEL[win].toLowerCase()}`} icon={Dog} />
            <div className="p-5"><BarList items={byDogs.map((r) => ({ name: r.ward, sub: `${r.district} · ${r.sightings} sightings`, count: r.dogsLow }))} color={CHART.teal} empty="No dogs seen near any ward yet. Add cameras or scan photos." /></div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Wards ranked by combined risk" subtitle="Score = 60% bites + 40% dogs, each compared with the busiest ward. Wards with no camera or scan are ranked on bites alone." />
        <Table head={["#", "Ward", "District", "Bites", "Most dogs at once", "Dog sightings", "Cameras", "Risk", "Why"]}>
          {scoped.map((r, i) => (
            <tr key={`${r.ward}:${r.district}`} onClick={() => setSelected(r.ward)} className={`cursor-pointer ${selected === r.ward ? "bg-navy-50" : "hover:bg-canvas/60"}`}>
              <td className="px-4 py-2.5 font-mono text-muted">{i + 1}</td>
              <td className="px-4 py-2.5 font-medium text-ink">{r.ward}</td>
              <td className="px-4 py-2.5">{r.district}</td>
              <td className="px-4 py-2.5 font-mono">{r.suppressed ? `< ${data?.threshold ?? 3}` : r.bites ?? 0}</td>
              <td className="px-4 py-2.5 font-mono">{r.dogsHigh ? r.dogsLow : <span className="text-muted">-</span>}</td>
              <td className="px-4 py-2.5 font-mono">{r.sightings || <span className="text-muted">0</span>}</td>
              <td className="px-4 py-2.5 font-mono">{r.cameras || <span className="text-muted">0</span>}</td>
              <td className="px-4 py-2.5"><Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge></td>
              <td className="px-4 py-2.5 text-xs text-muted">{r.note}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
