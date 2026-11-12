"use client";

import { Cctv, Dog, Pause, Play, Plus, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CamStats, LiveCamera } from "@/components/LiveCamera";
import { LocationPicker } from "@/components/LocationPicker";
import { DogMap, Legend, RECENCY_LEGEND } from "@/components/map";
import { ModelSelect } from "@/components/ModelSelect";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import type { LatLng } from "@/lib/geo";
import { inWindow } from "@/lib/geo";
import { type CameraCfg, cameras, type SourceKind, useCameras, useSightings } from "@/lib/store";

const KIND_LABEL: Record<SourceKind, string> = {
  device: "This device's camera (webcam / phone)",
  stream: "Network video stream (HLS .m3u8, MP4, WebM)",
  image: "Network image (MJPEG stream or snapshot JPEG)",
  file: "Recorded video file",
};
const SENSITIVITY = [{ value: 0.35, label: "High: more dogs, more false alarms" }, { value: 0.5, label: "Balanced" }, { value: 0.65, label: "Strict: only clear dogs" }];

function AddCamera({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SourceKind>("device");
  const [url, setUrl] = useState("");
  const [refresh, setRefresh] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [threshold, setThreshold] = useState(0.5);
  const [err, setErr] = useState("");

  const listDevices = useCallback(async (ask: boolean) => {
    try {
      if (ask) (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach((t) => t.stop());
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
    } catch { setErr("Camera permission was denied, so the list of cameras is not available. The default camera will be used."); }
  }, []);
  useEffect(() => {
    let off = false;
    navigator.mediaDevices?.enumerateDevices().then((d) => { if (!off) setDevices(d.filter((x) => x.kind === "videoinput")); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const mixed = typeof location !== "undefined" && location.protocol === "https:" && /^http:\/\//i.test(url);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Give the camera a name, for example “Market gate”.");
    if ((kind === "stream" || kind === "image") && !/^https?:\/\//i.test(url)) return setErr("Enter the full stream URL, starting with https://");
    if (!loc) return setErr("Set where the camera is, so its dogs show on the map.");
    cameras.add({ name: name.trim(), kind, url: url || undefined, deviceId: deviceId || undefined, refreshMs: kind === "image" && refresh ? 1000 : undefined, lat: loc[0], lng: loc[1], threshold });
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Camera name" htmlFor="cam-name" required><Input id="cam-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Market gate, ward 12" /></Field>
        <Field label="Video source" htmlFor="cam-kind" required>
          <Select id="cam-kind" value={kind} onChange={(e) => setKind(e.target.value as SourceKind)} options={(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </Field>
        {kind === "device" && (
          <Field label="Which camera" htmlFor="cam-dev" hint={devices.some((d) => d.label) ? undefined : "Names appear after you allow camera access."}>
            <div className="flex gap-2">
              <Select id="cam-dev" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} options={devices.filter((d) => d.deviceId).map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))} placeholder="Default (rear camera on phones)" />
              {!devices.some((d) => d.label) && <Button type="button" variant="secondary" onClick={() => listDevices(true)}>Allow</Button>}
            </div>
          </Field>
        )}
        {(kind === "stream" || kind === "image") && (
          <Field label="Stream URL" htmlFor="cam-url" required
            hint={kind === "stream" ? "Most NVRs and IP cameras can publish HLS. RTSP links (rtsp://) cannot play in a browser; put the camera behind a relay such as MediaMTX that serves HLS." : "Use the camera's MJPEG URL, or a snapshot URL with auto-refresh on."}
            error={mixed ? "This site is served over HTTPS, so browsers block http:// camera URLs. Use an https:// URL, or run StrayWatch locally on the same network." : undefined}>
            <Input id="cam-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "stream" ? "https://nvr.example.org/cam12/index.m3u8" : "https://camera.example.org/mjpeg"} />
          </Field>
        )}
        {kind === "image" && (
          <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />Snapshot URL: reload the image every second</label>
        )}
        {kind === "file" && <p className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">You will pick the video after adding the camera. The location you set is where the footage was recorded.</p>}
        <Field label="Sensitivity" htmlFor="cam-thr"><Select id="cam-thr" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} options={SENSITIVITY} /></Field>
        <p className="text-xs text-muted">The stream server must allow cross-origin requests (CORS) so the browser can read its frames. Webcams, phones and video files always work.</p>
      </div>
      <div className="space-y-4">
        <Field label="Camera location" required><LocationPicker value={loc} onChange={setLoc} /></Field>
        {err && <p className="text-[13px] font-medium text-alert-red" role="alert">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button><Button type="submit"><Plus className="size-4" />Add camera</Button></div>
      </div>
    </form>
  );
}

/** Sample cameras have no video: show their most recent sample dogs instead. */
function DemoFeed({ camId }: { camId: string }) {
  const all = useSightings();
  const recent = useMemo(() => all.filter((s) => s.cameraId === camId).slice(0, 6), [all, camId]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-navy-950">
      <div className="grid size-full grid-cols-3 grid-rows-2 gap-0.5 opacity-80">
        {recent.map((s) => s.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={s.id} src={s.thumb} alt="" className="size-full object-cover" />
          : <div key={s.id} className="bg-navy-900" />)}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-[12px] text-white">
        Sample camera: no live feed. Showing its latest demo sightings{recent[0] ? `, last at ${new Date(recent[0].at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}.
      </div>
    </div>
  );
}

function CameraCard({ cam, running, onToggle }: { cam: CameraCfg; running: boolean; onToggle: () => void }) {
  const [stats, setStats] = useState<CamStats>({ inView: 0, unique: 0, lastSeen: null, fps: 0 });
  const all = useSightings();
  const today = useMemo(() => all.filter((s) => s.cameraId === cam.id && inWindow(s.at, "24h")).length, [all, cam.id]);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">{cam.name}</p>
          <p className="truncate text-xs text-muted">{cam.demo ? "Sample camera" : KIND_LABEL[cam.kind].split(" (")[0]} · {cam.lat.toFixed(4)}, {cam.lng.toFixed(4)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {cam.demo ? <Badge tone="yellow">demo</Badge> : running && stats.inView > 0 ? <Badge tone="orange"><Dog className="size-3" />{stats.inView} in view</Badge> : running ? <Badge tone="teal">watching</Badge> : <Badge>stopped</Badge>}
          {!cam.demo && <Button size="sm" variant={running ? "secondary" : "teal"} onClick={onToggle} aria-label={running ? "Stop" : "Start"}>{running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>}
          <Button size="sm" variant="ghost" aria-label="Remove camera" onClick={() => { if (confirm(`Remove “${cam.name}”? Its past sightings stay in the log.`)) cameras.remove(cam.id); }}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>
      <div className="p-3">
        {cam.demo ? <DemoFeed camId={cam.id} /> : <LiveCamera key={running ? "on" : "off"} cam={cam} running={running} onStats={setStats} />}
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line text-center">
        {(cam.demo ? [["Logged in 24 h", today], ["Most at once", Math.max(0, ...all.filter((x) => x.cameraId === cam.id).slice(0, 200).map((x) => x.inView ?? 1))], ["Feed", "sample"]] : [["Dogs this session", stats.unique], ["Logged in 24 h", today], ["Detector speed", running ? `${stats.fps.toFixed(1)} fps` : "-"]]).map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-2.5"><p className="text-[11px] text-muted">{k}</p><p className="font-mono text-[15px] font-semibold text-navy-900">{v}</p></div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
        <span>Sensitivity</span>
        <select aria-label="Sensitivity" value={cam.threshold} onChange={(e) => cameras.update(cam.id, { threshold: Number(e.target.value) })} className="rounded border border-line bg-white px-1.5 py-0.5 text-xs">
          {SENSITIVITY.map((s) => <option key={s.value} value={s.value}>{s.label.split(":")[0]}</option>)}
        </select>
      </div>
    </Card>
  );
}

export default function CamerasPage() {
  const list = useCameras();
  const all = useSightings();
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const runCount = list.filter((c) => running[c.id]).length;
  const realCams = list.filter((c) => !c.demo);
  const today = all.filter((s) => s.source === "camera" && inWindow(s.at, "24h"));

  return (
    <>
      <PageHeader
        title="Live cameras"
        subtitle="Connect any camera and StrayWatch watches it for dogs. Each dog is tracked across frames so it is counted once, then logged with the camera's location. Keep this page open while monitoring: detection stops when you leave it or close the tab."
        actions={<><ModelSelect />{realCams.length > 0 && <Button variant="secondary" onClick={() => setRunning(runCount ? {} : Object.fromEntries(realCams.map((c) => [c.id, true])))}>{runCount ? <><Pause className="size-4" />Stop all</> : <><Play className="size-4" />Start all</>}</Button>}<Button onClick={() => setAdding(true)}><Plus className="size-4" />Add camera</Button></>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cameras" value={list.length} icon={Cctv} hint={`${runCount} watching now${list.length > realCams.length ? ` · ${list.length - realCams.length} demo` : ""}`} />
        <Stat label="Dogs logged (24 h)" value={today.length} icon={Dog} tone="orange" hint="one per dog track" />
        <Stat label="Most at once (24 h)" value={Math.max(0, ...today.map((s) => s.inView ?? 1))} icon={Video} tone="teal" hint="largest group seen together" />
        <Stat label="Cameras with dogs (24 h)" value={new Set(today.map((s) => s.cameraId)).size} icon={Cctv} tone="sage" />
      </div>

      {adding && <Card className="mt-6"><CardHeader title="Add a camera" subtitle="Tip: to use a phone as a camera, open this site on the phone, add “This device's camera” and use the phone's location." icon={Plus} /><AddCamera onDone={() => setAdding(false)} /></Card>}

      {list.length === 0 && !adding ? (
        <Card className="mt-6">
          <Empty title="No cameras yet" icon={Cctv}>
            Add this device&apos;s webcam or phone camera, a network stream from a CCTV/NVR, or a recorded video file. Dogs it sees appear on the dog map.
            <div className="mt-4"><Button onClick={() => setAdding(true)}><Plus className="size-4" />Add your first camera</Button></div>
          </Empty>
        </Card>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((c) => <CameraCard key={c.id} cam={c} running={!!running[c.id]} onToggle={() => setRunning((r) => ({ ...r, [c.id]: !r[c.id] }))} />)}
        </div>
      )}

      {list.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title="Camera map" subtitle="Cameras and the dogs they logged in the last 24 hours" />
          <DogMap cameras={list} sightings={today} height="h-[420px]" fitKey={String(list.length)} />
          <div className="border-t border-line px-4 py-2.5"><Legend items={RECENCY_LEGEND} /></div>
        </Card>
      )}
    </>
  );
}
