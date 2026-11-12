"use client";

import { Cctv, Crosshair, Dog, FlaskConical, ImageUp, MapPin, Satellite, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CHART, XYChart } from "@/components/charts";
import { DogMap, Legend, RECENCY_LEGEND } from "@/components/map";
import { seedDemo } from "@/components/Shell";
import { Button, Card, CardHeader, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { areaEstimate, distanceM, inWindow, type LatLng, WINDOW_LABEL, type WindowKey } from "@/lib/geo";
import { useCameras, useScans, useSightings } from "@/lib/store";
import { useNow } from "@/lib/useNow";

const RADII = [100, 250, 500, 1000, 2000];
const SOURCE_LABEL = { camera: "Camera", satellite: "Satellite", aerial: "Drone photo" } as const;

export default function DogMapPage() {
  const all = useSightings();
  const cams = useCameras();
  const allScans = useScans();
  const [win, setWin] = useState<WindowKey>("24h");
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(500);

  const now = useNow();
  // A sighting logged after the last tick is still "now"; never let it fall outside the window.
  const latest = Math.max(now, ...all.slice(0, 1).map((s) => Date.parse(s.at)));
  const rows = useMemo(() => all.filter((s) => inWindow(s.at, win, latest)), [all, win, latest]);
  const scansInWin = useMemo(() => allScans.filter((s) => inWindow(s.at, win, latest)), [allScans, win, latest]);
  const area = useMemo(() => {
    if (!center) return null;
    const near = rows.filter((s) => distanceM(center, [s.lat, s.lng]) <= radius);
    const nearScans = scansInWin.filter((s) => distanceM(center, [s.lat, s.lng]) <= radius + 300);
    const nearCams = cams.filter((c) => distanceM(center, [c.lat, c.lng]) <= radius);
    return { rows: near, cams: nearCams, scans: nearScans, est: areaEstimate(near, nearScans) };
  }, [center, radius, rows, scansInWin, cams]);
  const overall = useMemo(() => areaEstimate(rows, scansInWin), [rows, scansInWin]);
  const scoped = area?.rows ?? rows;

  const hourly = useMemo(() => {
    const b = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(latest - (23 - i) * 3600e3).toLocaleTimeString("en-IN", { hour: "2-digit", hour12: false }) + ":00", dogs: 0 }));
    for (const s of scoped) {
      const h = Math.floor((latest - Date.parse(s.at)) / 3600e3);
      if (h >= 0 && h < 24) b[23 - h].dogs++;
    }
    return b;
  }, [scoped, latest]);

  const empty = all.length === 0 && cams.length === 0;

  return (
    <>
      <PageHeader
        title="Dog map"
        subtitle="Every dog your cameras, satellite scans and drone photos found, on one map. Click anywhere to count the dogs around that spot."
        actions={
          <select aria-label="Time window" value={win} onChange={(e) => setWin(e.target.value as WindowKey)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm">
            {(Object.keys(WINDOW_LABEL) as WindowKey[]).map((k) => <option key={k} value={k}>{WINDOW_LABEL[k]}</option>)}
          </select>
        }
      />

      {empty ? (
        <Card>
          <Empty title="Nothing monitored yet" icon={Dog}>
            Start with any of these. Results appear on this map automatically.
            <div className="mt-4"><Button variant="secondary" onClick={seedDemo}><FlaskConical className="size-4" />Show demo data instead</Button></div>
          </Empty>
          <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
            {[
              { icon: Cctv, title: "Watch a live camera", body: "Use this laptop's webcam, a phone, a CCTV/NVR stream or a recorded video.", href: "/cameras", cta: "Add a camera" },
              { icon: Satellite, title: "Scan satellite imagery", body: "Find places that draw dogs and scan the imagery of any area.", href: "/satellite", cta: "Open satellite" },
              { icon: ImageUp, title: "Count dogs in a drone photo", body: "Upload a top-down photo and every dog in it is counted and mapped.", href: "/satellite#aerial", cta: "Scan a photo" },
            ].map((s) => (
              <div key={s.title} className="bg-white p-5">
                <s.icon className="size-5 text-teal-600" />
                <p className="mt-2 text-[14px] font-semibold text-ink">{s.title}</p>
                <p className="mt-1 text-[13px] text-muted">{s.body}</p>
                <LinkButton href={s.href} size="sm" variant="secondary" className="mt-3">{s.cta}</LinkButton>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={area ? "Dogs in selected area" : "Dogs seen"} value={(area?.est ?? overall).high === 0 ? "0" : (area?.est ?? overall).low === (area?.est ?? overall).high ? (area?.est ?? overall).low : `${(area?.est ?? overall).low}–${(area?.est ?? overall).high}`} icon={Dog} tone="orange"
              hint="at least (most seen at once) – at most (every track)" />
            <Stat label="Sightings" value={scoped.length} icon={MapPin} tone="teal" hint={WINDOW_LABEL[win].toLowerCase()} />
            <Stat label="Cameras" value={area ? area.cams.length : cams.length} icon={Cctv} hint={area ? `within ${radius} m` : "set up in this browser"} />
            <Stat label="Image scans" value={area ? area.scans.length : scansInWin.length} icon={Satellite} tone="sage" hint="satellite + drone" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] text-muted"><Crosshair className="size-4" />{center ? <>Area around <span className="font-mono text-ink">{center[0].toFixed(4)}, {center[1].toFixed(4)}</span></> : "Click the map to choose an area"}</p>
                <div className="flex items-center gap-2">
                  <select aria-label="Radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-white px-2 text-[13px]">
                    {RADII.map((r) => <option key={r} value={r}>{r < 1000 ? `${r} m` : `${r / 1000} km`} radius</option>)}
                  </select>
                  {center && <Button size="sm" variant="ghost" onClick={() => setCenter(null)}><X className="size-3.5" />Clear</Button>}
                </div>
              </div>
              <DogMap sightings={rows} cameras={cams} scans={scansInWin.filter((s) => s.bounds)} area={center ? { center, radiusM: radius } : null} onClick={setCenter} height="h-[540px]" fitKey={`${win}:${all.length > 0}`} />
              <div className="border-t border-line px-4 py-2.5"><Legend items={RECENCY_LEGEND} /></div>
            </Card>

            <div className="grid content-start gap-6">
              {area && (
                <Card>
                  <CardHeader title="Selected area" subtitle={`${radius < 1000 ? `${radius} m` : `${radius / 1000} km`} radius · ${WINDOW_LABEL[win].toLowerCase()}`} icon={Crosshair} />
                  <div className="space-y-2 p-5 text-[13px]">
                    <p className="text-[26px] font-semibold tracking-tight text-navy-900">{area.est.high === 0 ? "No dogs seen" : area.est.low === area.est.high ? `${area.est.low} dog${area.est.low === 1 ? "" : "s"}` : `${area.est.low}–${area.est.high} dogs`}</p>
                    <ul className="space-y-1 text-muted">
                      <li>{area.est.cameras ? `${area.est.camHigh} dog tracks from ${area.est.cameras} camera${area.est.cameras === 1 ? "" : "s"}` : area.cams.length ? `${area.cams.length} camera${area.cams.length === 1 ? "" : "s"} here, no dogs logged` : "No camera covers this area"}</li>
                      <li>{area.scans.length ? `${area.scans.length} image scan${area.scans.length === 1 ? "" : "s"}, most dogs in one: ${area.est.scanMax}` : "No satellite or drone scan here yet"}</li>
                    </ul>
                    <p className="pt-1 text-xs text-muted">The low number is the most dogs seen at the same moment (certainly different dogs). The high number counts every separate track, so a dog that walked past twice counts twice.</p>
                  </div>
                </Card>
              )}
              <Card>
                <CardHeader title="Dogs per hour" subtitle={`Last 24 hours${area ? ", selected area" : ""}`} />
                <div className="p-4"><XYChart data={hourly} xKey="hour" height={170} series={[{ key: "dogs", label: "Dogs", color: CHART.orange }]} /></div>
              </Card>
              <Card>
                <CardHeader title="Latest sightings" action={<LinkButton href="/sightings" size="sm" variant="ghost">All</LinkButton>} />
                {scoped.length === 0 ? <Empty title="No sightings in this window" /> : (
                  <ul className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
                    {scoped.slice(0, 12).map((s) => (
                      <li key={s.id} className="overflow-hidden rounded-lg border border-line">
                        {s.thumb
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={s.thumb} alt={`Dog seen by ${s.label}`} className="aspect-square w-full bg-black object-cover" />
                          : <div className="grid aspect-square place-items-center bg-canvas"><Dog className="size-5 text-muted" /></div>}
                        <p className="truncate px-1.5 pt-1 text-[11px] font-medium text-ink">{s.label}</p>
                        <p className="truncate px-1.5 pb-1 text-[10.5px] text-muted">{SOURCE_LABEL[s.source]} · {fmtDateTime(s.at).split(", ").slice(-1)[0]}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
