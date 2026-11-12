"use client";

import { AlertTriangle, FileVideo, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Box, detectDogs, type Frame, loadDetector, thumbnail } from "@/lib/detector";
import { type CameraCfg, sightings } from "@/lib/store";
import { Tracker, type Track } from "@/lib/tracker";
import { cx } from "./ui";

export type CamState = "idle" | "loading" | "live" | "ended" | "needs-file" | "error";
export type CamStats = { inView: number; unique: number; lastSeen: number | null; fps: number };

/** Video files picked for "file" cameras, kept for the session (object URLs cannot be saved). */
const FILES = new Map<string, { url: string; name: string }>();
const DETECT_EVERY_MS = 250;

function frameSize(f: Frame) {
  if (f instanceof HTMLVideoElement) return [f.videoWidth, f.videoHeight];
  if (f instanceof HTMLImageElement) return [f.naturalWidth, f.naturalHeight];
  return [f.width, f.height];
}
function ready(f: Frame) {
  if (f instanceof HTMLVideoElement) return f.readyState >= 2 && f.videoWidth > 0 && !f.paused;
  if (f instanceof HTMLImageElement) return f.complete && f.naturalWidth > 0;
  return true;
}

function draw(canvas: HTMLCanvasElement, frame: Frame, tracks: Track[], raw: Box[]) {
  const [w, h] = frameSize(frame);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const lw = Math.max(2, w / 320), fs = Math.max(12, w / 40);
  ctx.font = `600 ${fs}px ui-monospace, monospace`;
  // Unconfirmed detections: thin dashed boxes (not counted yet).
  ctx.setLineDash([lw * 3, lw * 2]);
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = lw * 0.6;
  for (const b of raw) if (!tracks.some((t) => t.box === b)) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);
  for (const t of tracks) {
    const b = t.box;
    ctx.strokeStyle = "#ffb020";
    ctx.lineWidth = lw;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const label = `dog #${t.id} ${(b.score * 100).toFixed(0)}%`;
    const tw = ctx.measureText(label).width + fs * 0.6;
    ctx.fillStyle = "#ffb020";
    ctx.fillRect(b.x - lw / 2, Math.max(0, b.y - fs * 1.4), tw, fs * 1.4);
    ctx.fillStyle = "#111";
    ctx.fillText(label, b.x + fs * 0.3, Math.max(fs * 1.05, b.y - fs * 0.35));
  }
}

export function LiveCamera({ cam, running, onStats, className }: { cam: CameraCfg; running: boolean; onStats?: (s: CamStats) => void; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tracker = useRef(new Tracker(3, 8));
  const unique = useRef(0);
  const lastSeen = useRef<number | null>(null);
  // The parent remounts this component (key) when it starts or stops, so the initial state is enough.
  const [state, setState] = useState<CamState>(running ? "loading" : "idle");
  const [logged, setLogged] = useState(0);
  const [error, setError] = useState<string>("");
  const [file, setFile] = useState(() => FILES.get(cam.id) ?? null);
  const [aspect, setAspect] = useState(16 / 9);
  const statsCb = useRef(onStats);
  useEffect(() => { statsCb.current = onStats; }, [onStats]);

  const fail = useCallback((msg: string) => { setError(msg); setState("error"); }, []);

  /* ---------------------------------------------------------------- source */
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let hls: { destroy(): void } | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const video = videoRef.current, img = imgRef.current;
    tracker.current.reset();

    (async () => {
      try {
        await loadDetector();
        if (cancelled) return;
        if (cam.kind === "device") {
          if (!navigator.mediaDevices?.getUserMedia) return fail("This browser cannot open a camera. Use Chrome, Edge, Safari or Firefox over HTTPS.");
          stream = await navigator.mediaDevices.getUserMedia({ video: cam.deviceId ? { deviceId: { exact: cam.deviceId } } : { facingMode: "environment" }, audio: false });
          if (cancelled) return stream.getTracks().forEach((t) => t.stop());
          video!.srcObject = stream;
          await video!.play();
        } else if (cam.kind === "file") {
          if (!file) return setState("needs-file");
          video!.src = file.url;
          await video!.play();
        } else if (cam.kind === "stream") {
          const url = cam.url!;
          video!.crossOrigin = "anonymous";
          if (/\.m3u8(\?|$)/i.test(url) && !video!.canPlayType("application/vnd.apple.mpegurl")) {
            const { default: Hls } = await import("hls.js");
            if (!Hls.isSupported()) return fail("This browser cannot play HLS (.m3u8) streams.");
            const h = new Hls({ lowLatencyMode: true });
            hls = h;
            h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) fail(`Stream error: ${d.details}. Check the URL and that the server allows cross-origin (CORS) requests.`); });
            h.loadSource(url);
            h.attachMedia(video!);
          } else {
            video!.src = url;
          }
          await video!.play();
        } else if (cam.kind === "image") {
          const load = () => { img!.src = cam.refreshMs ? `${cam.url}${cam.url!.includes("?") ? "&" : "?"}_t=${Date.now()}` : cam.url!; };
          img!.crossOrigin = "anonymous";
          load();
          if (cam.refreshMs) timer = setInterval(load, cam.refreshMs);
        }
        if (!cancelled) setState("live");
      } catch (e) {
        if (cancelled) return;
        const err = e as Error;
        if (err.name === "NotAllowedError") fail("Camera permission was denied. Allow camera access for this site in the browser's address bar, then press Start.");
        else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") fail("That camera is not connected. Edit the camera and pick another device.");
        else if (err.name === "NotSupportedError") fail("The browser cannot play this source. For IP cameras use an HLS (.m3u8), MP4/WebM or MJPEG URL; RTSP needs a relay (see README).");
        else fail(err.message || "Could not start this camera.");
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      hls?.destroy();
      if (timer) clearInterval(timer);
      if (video) { video.pause(); video.removeAttribute("src"); video.srcObject = null; video.load(); }
      if (img) img.removeAttribute("src");
    };
  }, [running, cam.kind, cam.url, cam.deviceId, cam.refreshMs, file, fail]);

  /* ---------------------------------------------------------------- detection loop */
  useEffect(() => {
    if (state !== "live") return;
    let stop = false;
    const frame: Frame = cam.kind === "image" ? imgRef.current! : videoRef.current!;
    const times: number[] = [];

    (async () => {
      while (!stop) {
        const t0 = performance.now();
        if (frame instanceof HTMLVideoElement && frame.ended) { setState("ended"); break; }
        if (ready(frame)) {
          const [w, h] = frameSize(frame);
          if (w && h) setAspect(w / h);
          let boxes: Box[];
          try {
            boxes = await detectDogs(frame, cam.threshold);
          } catch (e) {
            if (stop) break;
            const msg = (e as Error).message || "";
            fail(/tainted|cross-origin|SecurityError/i.test(msg) || (e as Error).name === "SecurityError"
              ? "The camera server does not allow cross-origin access (CORS), so the browser will not let the page read its frames. Enable CORS on the camera or put it behind a relay."
              : `Detection failed: ${msg}`);
            break;
          }
          if (stop) break;
          const now = Date.now();
          const { active, confirmedNow } = tracker.current.update(boxes, now);
          if (overlayRef.current) draw(overlayRef.current, frame, active, boxes);
          if (active.length) lastSeen.current = now;
          if (confirmedNow.length) {
            unique.current += confirmedNow.length;
            setLogged(unique.current);
            sightings.add(...confirmedNow.map((t) => ({
              at: new Date(now).toISOString(), source: "camera" as const, label: cam.name, cameraId: cam.id,
              lat: cam.lat, lng: cam.lng, score: Math.round(t.best.score * 100) / 100, trackId: t.id, inView: active.length,
              thumb: thumbnail(frame, t.box),
            })));
          }
          times.push(now);
          while (times.length && now - times[0] > 5000) times.shift();
          statsCb.current?.({ inView: active.length, unique: unique.current, lastSeen: lastSeen.current, fps: times.length / 5 });
        }
        await new Promise((r) => setTimeout(r, Math.max(30, DETECT_EVERY_MS - (performance.now() - t0))));
      }
    })();
    return () => { stop = true; };
  }, [state, cam.kind, cam.id, cam.name, cam.lat, cam.lng, cam.threshold, fail]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const prev = FILES.get(cam.id);
    if (prev) URL.revokeObjectURL(prev.url);
    const v = { url: URL.createObjectURL(f), name: f.name };
    FILES.set(cam.id, v);
    unique.current = 0;
    setLogged(0);
    setError("");
    setState("loading");
    setFile(v);
  };

  return (
    <div className={cx("relative overflow-hidden rounded-lg bg-black", className)} style={{ aspectRatio: aspect }}>
      {cam.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={imgRef} alt={`Live image from ${cam.name}`} className="absolute inset-0 size-full object-contain" onError={() => running && fail("Could not load the image URL. Check it opens in a new tab, and that the server allows cross-origin (CORS) requests.")} />
      ) : (
        <video ref={videoRef} muted playsInline className="absolute inset-0 size-full object-contain" />
      )}
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full object-contain" />

      {state === "loading" && <Overlay><Loader2 className="size-5 animate-spin" />Loading detector and starting source…</Overlay>}
      {state === "idle" && <Overlay>Paused</Overlay>}
      {state === "ended" && <Overlay>Video finished. {logged} dog{logged === 1 ? "" : "s"} logged.</Overlay>}
      {state === "error" && <Overlay tone="error"><AlertTriangle className="size-5 shrink-0" /><span>{error}</span></Overlay>}
      {(state === "needs-file" || (cam.kind === "file" && state === "ended")) && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-navy-900 shadow">
            <FileVideo className="size-4" />{file ? "Choose another video" : "Choose a video file to analyse"}
            <input type="file" accept="video/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}

function Overlay({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className={cx("absolute inset-0 flex items-center justify-center gap-2 p-6 text-center text-[13px]", tone === "error" ? "bg-red-950/80 text-red-50" : "bg-black/55 text-white/90")}>
      {children}
    </div>
  );
}
