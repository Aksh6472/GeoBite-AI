"use client";

import { ImageUp, ScanSearch } from "lucide-react";
import { useRef, useState } from "react";
import { type Box, detectTiled, loadDetector, thumbnail } from "@/lib/detector";
import type { LatLng } from "@/lib/geo";
import { scans, sightings } from "@/lib/store";
import { LocationPicker } from "./LocationPicker";
import { ScanResult } from "./ScanResult";
import { Button, Card, CardHeader, ErrorBanner, Field } from "./ui";

/**
 * Drone, aerial or rooftop photos. At drone heights (roughly 2-5 cm per pixel) a dog is tens
 * of pixels long, which the detector handles well, unlike 30 cm satellite pixels.
 */
export function AerialScan() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);

  const pick = (f?: File) => {
    if (!f) return;
    const im = new Image();
    im.onload = () => { setImg(im); setBoxes(null); setErr(""); };
    im.onerror = () => setErr("That file could not be opened as an image.");
    im.src = URL.createObjectURL(f);
    setName(f.name);
  };

  const run = async () => {
    if (!img) return;
    if (!loc) return setErr("Set where the photo was taken, so the dogs it finds show on the map.");
    setErr(""); setBoxes(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      setProgress([0, 1]);
      await loadDetector();
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const found = await detectTiled(img, { window: Math.max(400, Math.round(side / 2)), overlap: 0.4, minScore: 0.4, onProgress: (d, t) => setProgress([d, t]), signal: ctl.signal });
      setBoxes(found);
      const at = new Date().toISOString();
      const scan = scans.add({ at, kind: "aerial", label: name || "Aerial photo", lat: loc[0], lng: loc[1], dogs: found.length, widthPx: img.naturalWidth, heightPx: img.naturalHeight });
      sightings.add(...found.map((b) => ({ at, source: "aerial" as const, label: name || "Aerial photo", lat: loc[0], lng: loc[1], score: Math.round(b.score * 100) / 100, scanId: scan.id, thumb: thumbnail(img, b) })));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message || "Scan failed");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <Card>
      <CardHeader title="Scan a drone or aerial photo" subtitle="Upload a top-down photo from a drone, a rooftop or a tall building. Each dog found is logged at the location you set." icon={ImageUp} />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-canvas/60 px-4 py-6 text-center text-[13px] text-muted hover:border-navy-300">
            <ImageUp className="size-6 text-navy-500" />
            <span><strong className="text-navy-900">{img ? name : "Choose a photo"}</strong>{img ? ` · ${img.naturalWidth} × ${img.naturalHeight}px · click to change` : " (JPEG or PNG; never uploaded)"}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {img && <ScanResult image={img} boxes={boxes ?? []} label={`Photo ${name} with ${boxes?.length ?? 0} dogs marked`} />}
          {boxes && <p className="text-[13px] font-medium text-navy-900">{boxes.length ? `${boxes.length} dog${boxes.length === 1 ? "" : "s"} found and logged.` : "No dogs found in this photo."}</p>}
        </div>
        <div className="space-y-3">
          <Field label="Where was the photo taken?" required><LocationPicker value={loc} onChange={setLoc} basemap="satellite" height="h-[220px]" /></Field>
          <ErrorBanner error={err || null} />
          <div className="flex items-center justify-end gap-2">
            {progress && <span className="font-mono text-xs text-muted">{progress[0]}/{progress[1]} windows</span>}
            {progress ? <Button variant="secondary" onClick={() => abort.current?.abort()}>Cancel</Button>
              : <Button onClick={run} disabled={!img}><ScanSearch className="size-4" />Find dogs in photo</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}
