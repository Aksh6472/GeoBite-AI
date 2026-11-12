"use client";

import type { Map as LMap } from "leaflet";
import { Info, Loader2, MapPin, Satellite, ScanSearch, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AerialScan } from "@/components/AerialScan";
import { DogMap, Legend, Toggle } from "@/components/map";
import { SAT_URL } from "@/components/map/tiles";
import { ModelSelect } from "@/components/ModelSelect";
import { ScanResult } from "@/components/ScanResult";
import { Badge, Button, Card, CardHeader, ErrorBanner, PageHeader } from "@/components/ui";
import { type Box, detectTiled, loadDetector, thumbnail } from "@/lib/detector";
import { type LatLng, latToPx, lngToPx, metresPerPx, pxToLat, pxToLng, TILE } from "@/lib/geo";
import { ATTRACTOR_META, type Attractor, type AttractorKind, fetchAttractors } from "@/lib/osm";
import { scans as scanStore, sightings, useScans } from "@/lib/store";

const Z = 19;                 // Esri World Imagery's finest level available almost everywhere
const MAX_PX = 2400 * 1600;   // keep a scan to a few seconds of detection
const MIN_SCAN_ZOOM = 17;

type View = { zoom: number; s: number; w: number; n: number; e: number; c: LatLng };

function loadTile(x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("A satellite tile failed to load. Check the connection and try again."));
    im.src = SAT_URL.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y));
  });
}

/** Group attractors into ~200 m squares and rank squares by how much draws dogs there. */
function hotspots(list: Attractor[]) {
  const cells = new Map<string, { lat: number; lng: number; score: number; kinds: Partial<Record<AttractorKind, number>>; names: string[] }>();
  for (const a of list) {
    const d = 200 / 111320, dl = 200 / (111320 * Math.cos((a.lat * Math.PI) / 180));
    const k = `${Math.floor(a.lat / d)}:${Math.floor(a.lng / dl)}`;
    const c = cells.get(k) ?? { lat: 0, lng: 0, score: 0, kinds: {}, names: [] };
    const n = Object.values(c.kinds).reduce((s, v) => s + (v ?? 0), 0);
    c.lat = (c.lat * n + a.lat) / (n + 1); c.lng = (c.lng * n + a.lng) / (n + 1);
    c.score += ATTRACTOR_META[a.kind].weight;
    c.kinds[a.kind] = (c.kinds[a.kind] ?? 0) + 1;
    if (a.name !== ATTRACTOR_META[a.kind].label && c.names.length < 3) c.names.push(a.name);
    cells.set(k, c);
  }
  return [...cells.values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

export default function SatellitePage() {
  const map = useRef<LMap | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [attractors, setAttractors] = useState<Attractor[]>([]);
  const [osmBusy, setOsmBusy] = useState(false);
  const [showOsm, setShowOsm] = useState(true);
  const [showScans, setShowScans] = useState(true);
  const [err, setErr] = useState("");
  const [scan, setScan] = useState<{ canvas: HTMLCanvasElement; boxes: Box[]; mpp: number; dogs: { lat: number; lng: number; score: number }[] } | null>(null);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [focus, setFocus] = useState<{ at: LatLng; zoom?: number; key: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pastScans = useScans();
  const [search, setSearch] = useState("");

  const onMove = useCallback((m: LMap) => {
    const b = m.getBounds(), c = m.getCenter();
    setView({ zoom: m.getZoom(), s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast(), c: [c.lat, c.lng] });
  }, []);

  const scanPixels = view ? (lngToPx(view.e, Z) - lngToPx(view.w, Z)) * (latToPx(view.s, Z) - latToPx(view.n, Z)) : 0;
  const mpp = view ? metresPerPx(view.c[0], Z) : 0.3;
  const canScan = !!view && view.zoom >= MIN_SCAN_ZOOM && scanPixels <= MAX_PX;

  const runScan = async () => {
    if (!view || !canScan) return;
    setErr(""); setScan(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const x0 = Math.floor(lngToPx(view.w, Z)), x1 = Math.ceil(lngToPx(view.e, Z));
      const y0 = Math.floor(latToPx(view.n, Z)), y1 = Math.ceil(latToPx(view.s, Z));
      const canvas = document.createElement("canvas");
      canvas.width = x1 - x0; canvas.height = y1 - y0;
      const ctx = canvas.getContext("2d")!;
      const tiles: [number, number][] = [];
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++)
        for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) tiles.push([tx, ty]);
      let loaded = 0;
      setProgress({ step: "Downloading satellite imagery", done: 0, total: tiles.length });
      const queue = [...tiles];
      await Promise.all(Array.from({ length: 6 }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          if (ctl.signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
          const im = await loadTile(t[0], t[1]);
          ctx.drawImage(im, t[0] * TILE - x0, t[1] * TILE - y0);
          setProgress({ step: "Downloading satellite imagery", done: ++loaded, total: tiles.length });
        }
      }));
      setProgress({ step: "Loading detector", done: 0, total: 1 });
      await loadDetector();
      const boxes = await detectTiled(canvas, {
        window: 160, overlap: 0.3, minScore: 0.35, wholeImage: false, signal: ctl.signal,
        onProgress: (done, total) => setProgress({ step: "Looking for dogs", done, total }),
      });
      const dogs = boxes.map((b) => ({ lat: pxToLat(y0 + b.y + b.h / 2, Z), lng: pxToLng(x0 + b.x + b.w / 2, Z), score: b.score }));
      const at = new Date().toISOString();
      const metres = metresPerPx(view.c[0], Z);
      const rec = scanStore.add({ at, kind: "satellite", label: `Satellite scan ${view.c[0].toFixed(4)}, ${view.c[1].toFixed(4)}`, lat: view.c[0], lng: view.c[1], bounds: [[view.s, view.w], [view.n, view.e]], dogs: dogs.length, widthPx: canvas.width, heightPx: canvas.height, metresPerPx: metres });
      sightings.add(...dogs.map((d, i) => ({ at, source: "satellite" as const, label: "Satellite scan", lat: d.lat, lng: d.lng, score: Math.round(d.score * 100) / 100, scanId: rec.id, thumb: thumbnail(canvas, boxes[i], 64) })));
      setScan({ canvas, boxes, mpp: metres, dogs });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message || "Scan failed");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const findAttractors = async () => {
    if (!view) return;
    if ((view.n - view.s) * (view.e - view.w) > 0.06) return setErr("Zoom in to a neighbourhood or a few wards (zoom level 13 or closer) before looking up dog hotspots.");
    setErr(""); setOsmBusy(true);
    try {
      setAttractors(await fetchAttractors(view));
      setShowOsm(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOsmBusy(false);
    }
  };

  const goTo = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return setFocus({ at: [Number(m[1]), Number(m[2])], zoom: 18, key: q + Date.now() });
    try {
      setErr("");
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      const d: { lat: string; lon: string }[] = await r.json();
      if (!d.length) return setErr(`No place called “${q}” was found.`);
      setFocus({ at: [Number(d[0].lat), Number(d[0].lon)], zoom: 17, key: q + Date.now() });
    } catch { setErr("Place search is unavailable right now. Type coordinates instead (lat, lng)."); }
  };

  const spots = useMemo(() => hotspots(attractors), [attractors]);
  const byKind = useMemo(() => {
    const m: Partial<Record<AttractorKind, number>> = {};
    for (const a of attractors) m[a.kind] = (m[a.kind] ?? 0) + 1;
    return m;
  }, [attractors]);
  const dogPx = 0.9 / mpp; // a medium street dog is about 0.9 m nose to tail

  return (
    <>
      <PageHeader
        title="Satellite & drone scan"
        subtitle="Look at any area on real satellite imagery, scan it for dogs, find the places that draw dogs (garbage, meat shops, markets, vacant land) from OpenStreetMap, and count dogs in drone photos."
        actions={<ModelSelect />}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <form onSubmit={goTo} className="flex min-w-[240px] flex-1 gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Go to a place or lat, lng" aria-label="Search place"
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100" />
            <Button type="submit" variant="secondary" size="sm" className="h-9"><Search className="size-3.5" />Go</Button>
          </form>
          <Button variant="secondary" size="sm" className="h-9" onClick={findAttractors} loading={osmBusy}><MapPin className="size-3.5" />Find dog hotspots here</Button>
          {progress ? (
            <Button variant="secondary" size="sm" className="h-9" onClick={() => abort.current?.abort()}><Loader2 className="size-3.5 animate-spin" />Cancel scan</Button>
          ) : (
            <Button size="sm" className="h-9" onClick={runScan} disabled={!canScan} title={canScan ? undefined : "Zoom in further to scan"}><ScanSearch className="size-3.5" />Scan this view for dogs</Button>
          )}
        </div>
        <DogMap basemap="satellite" height="h-[560px]" center={[13.0418, 80.2341]} zoom={16} onReady={(m) => { map.current = m; }} onMove={onMove} focus={focus}
          attractors={showOsm ? attractors : []} scans={showScans ? pastScans.filter((s) => s.kind === "satellite") : []} dogs={scan?.dogs ?? []} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <div className="flex flex-wrap gap-2">
            <Toggle on={showOsm} onChange={setShowOsm} label={`Dog hotspots (${attractors.length})`} />
            <Toggle on={showScans} onChange={setShowScans} label="Past scans" />
          </div>
          <p className="text-xs text-muted">
            {view && (view.zoom < MIN_SCAN_ZOOM ? `Zoom in to level ${MIN_SCAN_ZOOM}+ to scan (now ${view.zoom}).`
              : scanPixels > MAX_PX ? "This view is too large to scan in one go. Zoom in one level."
              : `Ready to scan ~${Math.round(scanPixels / 1e6 * 10) / 10} MP at ${mpp.toFixed(2)} m per pixel.`)}
          </p>
        </div>
        {progress && (
          <div className="border-t border-line px-4 py-2.5">
            <div className="flex justify-between text-xs text-muted"><span>{progress.step}…</span><span className="font-mono">{progress.done}/{progress.total}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-50"><div className="h-full bg-teal-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
          </div>
        )}
      </Card>

      <div className="mt-4"><ErrorBanner error={err || null} /></div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 text-[13px] text-navy-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>What satellite imagery can and cannot do.</strong> The best free imagery is about {mpp.toFixed(2)} m per pixel here, so a street dog is only about {dogPx.toFixed(0)}–{(dogPx * 1.3).toFixed(0)} pixels long.
          The scan will find dogs only where the imagery is sharp and the dog stands out (open ground, a group, a dark dog on light ground), and the picture may be months or years old.
          Use satellite for <em>where dogs are likely to gather</em> (the hotspot lookup), and use live cameras or drone photos to actually <em>count</em> them.
        </p>
      </div>

      {scan && (
        <Card className="mt-6">
          <CardHeader title={`Scan result: ${scan.dogs.length} possible dog${scan.dogs.length === 1 ? "" : "s"}`} subtitle={`${scan.canvas.width} × ${scan.canvas.height} px at ${scan.mpp.toFixed(2)} m/pixel. Found dogs are marked in red on the map and saved to the sightings log.`} icon={Satellite} />
          <div className="p-4"><ScanResult image={scan.canvas} boxes={scan.boxes} label="Stitched satellite image with detections" /></div>
        </Card>
      )}

      {attractors.length > 0 && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader title="Places that draw dogs in this view" subtitle="From OpenStreetMap. These are mapped places, not dog counts." icon={MapPin} />
            <ul className="divide-y divide-line">
              {(Object.keys(ATTRACTOR_META) as AttractorKind[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="flex items-center gap-2 text-[13px]"><span className="size-2.5 rounded-full" style={{ background: ATTRACTOR_META[k].color }} /><span className="font-medium text-ink">{ATTRACTOR_META[k].label}</span><span className="hidden text-muted sm:inline">· {ATTRACTOR_META[k].why}</span></span>
                  <span className="font-mono text-[13px] font-semibold">{byKind[k] ?? 0}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-2.5"><Legend items={(Object.keys(ATTRACTOR_META) as AttractorKind[]).map((k) => ({ color: ATTRACTOR_META[k].color, label: ATTRACTOR_META[k].label }))} /></div>
          </Card>
          <Card>
            <CardHeader title="Likely dog gathering spots" subtitle="200 m squares ranked by what is there (waste and meat count most). Good places to point a camera or fly a drone." />
            <ul className="divide-y divide-line">
              {spots.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">#{i + 1} · score {s.score}</p>
                    <p className="truncate text-xs text-muted">{(Object.entries(s.kinds) as [AttractorKind, number][]).map(([k, n]) => `${n} ${ATTRACTOR_META[k].label.toLowerCase()}`).join(", ")}{s.names.length ? ` · ${s.names.join(", ")}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.score >= 5 && <Badge tone="red">high</Badge>}
                    <Button size="sm" variant="secondary" onClick={() => setFocus({ at: [s.lat, s.lng], zoom: 18, key: `${i}-${Date.now()}` })}>View</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div id="aerial" className="mt-6 scroll-mt-20"><AerialScan /></div>
    </>
  );
}
