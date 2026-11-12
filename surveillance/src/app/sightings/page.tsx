"use client";

import { Download, Dog, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, PageHeader, Table, Tabs } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { fmtLatLng, inWindow, WINDOW_LABEL, type WindowKey } from "@/lib/geo";
import { exportAll, importAll, type SightingSource, sightings, useSightings } from "@/lib/store";

const SOURCE: Record<SightingSource, { label: string; tone: string }> = { camera: { label: "Camera", tone: "teal" }, satellite: { label: "Satellite", tone: "navy" }, aerial: { label: "Drone photo", tone: "orange" } };

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function SightingsPage() {
  const all = useSightings();
  const [src, setSrc] = useState<"all" | SightingSource>("all");
  const [win, setWin] = useState<WindowKey>("all");
  const [msg, setMsg] = useState("");
  const rows = useMemo(() => all.filter((s) => (src === "all" || s.source === src) && inWindow(s.at, win)), [all, src, win]);
  const count = (k: SightingSource) => all.filter((s) => s.source === k && inWindow(s.at, win)).length;
  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = () => download(`straywatch-sightings-${stamp}.csv`, [
    ["time", "source", "where", "latitude", "longitude", "confidence", "dogs_in_view", "camera_id", "track_id", "scan_id"].join(","),
    ...rows.map((s) => [s.at, s.source, s.label, s.lat, s.lng, s.score, s.inView ?? "", s.cameraId ?? "", s.trackId ?? "", s.scanId ?? ""].map(csvCell).join(",")),
  ].join("\n"), "text/csv");

  const onImport = async (f?: File) => {
    if (!f) return;
    try { setMsg(`Imported ${importAll(await f.text())} new sightings.`); }
    catch (e) { setMsg((e as Error).message || "That file could not be imported."); }
  };

  return (
    <>
      <PageHeader
        title="Sightings log"
        subtitle="Every dog found, newest first. Data lives in this browser: export it to keep a copy or combine devices (import merges without duplicates)."
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" />CSV</Button>
          <Button variant="secondary" onClick={() => download(`straywatch-backup-${stamp}.json`, exportAll(), "application/json")} disabled={!all.length}><Download className="size-4" />Backup</Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"><Upload className="size-4" />Import<input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onImport(e.target.files?.[0])} /></label>
          <Button variant="danger" disabled={!all.length} onClick={() => { if (confirm("Delete every sighting and scan saved in this browser? Export a backup first if you need them.")) sightings.clear(); }}><Trash2 className="size-4" />Clear</Button>
        </>}
      />
      {msg && <p className="mb-4 rounded-lg bg-navy-50 px-4 py-2.5 text-[13px] text-navy-800" role="status">{msg}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={src} onChange={setSrc} items={[{ value: "all", label: "All", count: rows.length && src === "all" ? rows.length : undefined }, ...(Object.keys(SOURCE) as SightingSource[]).map((k) => ({ value: k, label: SOURCE[k].label, count: count(k) }))]} />
        <select aria-label="Time window" value={win} onChange={(e) => setWin(e.target.value as WindowKey)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm">
          {(Object.keys(WINDOW_LABEL) as WindowKey[]).map((k) => <option key={k} value={k}>{WINDOW_LABEL[k]}</option>)}
        </select>
      </div>

      <Card>
        {rows.length === 0 ? <Empty title="No sightings" icon={Dog}>Dogs found by cameras and scans are listed here.</Empty> : (
          <Table head={["", "Time", "Source", "Where", "Location", "Confidence", "In view", ""]}>
            {rows.slice(0, 500).map((s) => (
              <tr key={s.id} className="hover:bg-canvas/60">
                <td className="px-4 py-2">
                  {s.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.thumb} alt="" className="size-11 rounded-md bg-black object-cover" />
                    : <div className="grid size-11 place-items-center rounded-md bg-canvas"><Dog className="size-4 text-muted" /></div>}
                </td>
                <td className="whitespace-nowrap px-4 py-2">{fmtDateTime(s.at)}</td>
                <td className="px-4 py-2"><Badge tone={SOURCE[s.source].tone}>{SOURCE[s.source].label}</Badge>{s.demo && <Badge tone="yellow" className="ml-1">demo</Badge>}</td>
                <td className="px-4 py-2">{s.label}{s.trackId ? <span className="text-muted"> · dog #{s.trackId}</span> : null}</td>
                <td className="px-4 py-2"><a className="font-mono text-xs text-navy-600 hover:underline" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=19/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer">{fmtLatLng(s.lat, s.lng)}</a></td>
                <td className="px-4 py-2 font-mono">{Math.round(s.score * 100)}%</td>
                <td className="px-4 py-2 font-mono">{s.inView ?? "-"}</td>
                <td className="px-4 py-2"><Button size="sm" variant="ghost" aria-label="Delete sighting" onClick={() => sightings.remove(s.id)}><Trash2 className="size-3.5" /></Button></td>
              </tr>
            ))}
          </Table>
        )}
        {rows.length > 500 && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Showing the newest 500 of {rows.length}. Export CSV for all of them.</p>}
      </Card>
    </>
  );
}
