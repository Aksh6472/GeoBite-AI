"use client";

/**
 * Local store for cameras, sightings and scans.
 *
 * Everything is kept in this browser's localStorage: there is no server, so nothing a camera
 * sees is uploaded anywhere. Use Export / Import on the Sightings page to move data between
 * devices. Thumbnails are capped so the store stays well inside the browser's ~5 MB quota.
 */

import { useSyncExternalStore } from "react";

export type SourceKind = "device" | "file" | "stream" | "image";
export type CameraCfg = {
  id: string; name: string; kind: SourceKind;
  url?: string; deviceId?: string; refreshMs?: number;
  lat: number; lng: number; threshold: number; createdAt: string; demo?: boolean;
};
export type SightingSource = "camera" | "satellite" | "aerial";
export type Sighting = {
  id: string; at: string; source: SightingSource; label: string;
  lat: number; lng: number; score: number;
  cameraId?: string; trackId?: number; inView?: number; scanId?: string; thumb?: string; demo?: boolean;
};
export type Scan = {
  id: string; at: string; kind: "satellite" | "aerial"; label: string;
  lat: number; lng: number; bounds?: [[number, number], [number, number]];
  dogs: number; widthPx: number; heightPx: number; metresPerPx?: number; demo?: boolean;
};

const KEYS = { cameras: "straywatch:v1:cameras", sightings: "straywatch:v1:sightings", scans: "straywatch:v1:scans" } as const;
type Name = keyof typeof KEYS;
type Shape = { cameras: CameraCfg[]; sightings: Sighting[]; scans: Scan[] };

const MAX_SIGHTINGS = 5000, MAX_THUMBS = 400, MAX_SCANS = 300;
const EMPTY: Shape = { cameras: [], sightings: [], scans: [] };
const cache: Partial<Shape> = {};
const listeners = new Set<() => void>();

function read<N extends Name>(n: N): Shape[N] {
  if (cache[n]) return cache[n] as Shape[N];
  let v: Shape[N] = EMPTY[n];
  try {
    const raw = localStorage.getItem(KEYS[n]);
    if (raw) v = JSON.parse(raw);
  } catch { /* unavailable or corrupt: start empty */ }
  cache[n] = v;
  return v;
}

function write<N extends Name>(n: N, v: Shape[N]) {
  if (n === "sightings") v = trimSightings(v as Sighting[]) as Shape[N];
  if (n === "scans") v = (v as Scan[]).slice(0, MAX_SCANS) as Shape[N];
  cache[n] = v;
  try {
    localStorage.setItem(KEYS[n], JSON.stringify(v));
  } catch {
    // Quota exceeded: drop pictures from the older half and try once more.
    if (n === "sightings") {
      const s = v as Sighting[];
      const half = Math.floor(s.length / 2);
      const slim = s.map((x, i) => (i >= half ? { ...x, thumb: undefined } : x));
      cache[n] = slim as Shape[N];
      try { localStorage.setItem(KEYS[n], JSON.stringify(slim)); } catch { /* keep in memory only */ }
    }
  }
  listeners.forEach((l) => l());
}

/** Newest first; keep pictures only on the most recent sightings. */
function trimSightings(s: Sighting[]) {
  return s.slice(0, MAX_SIGHTINGS).map((x, i) => (i >= MAX_THUMBS && x.thumb ? { ...x, thumb: undefined } : x));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    const n = (Object.keys(KEYS) as Name[]).find((k) => KEYS[k] === e.key);
    if (n) { delete cache[n]; l(); }
  };
  window.addEventListener("storage", onStorage); // keep several open tabs in sync
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

function useStore<N extends Name>(n: N): Shape[N] {
  return useSyncExternalStore(subscribe, () => read(n), () => EMPTY[n]);
}
export const useCameras = () => useStore("cameras");
export const useSightings = () => useStore("sightings");
export const useScans = () => useStore("scans");

export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const cameras = {
  add(c: Omit<CameraCfg, "id" | "createdAt">) {
    const cam: CameraCfg = { ...c, id: uid("cam"), createdAt: new Date().toISOString() };
    write("cameras", [...read("cameras"), cam]);
    return cam;
  },
  update(id: string, patch: Partial<CameraCfg>) { write("cameras", read("cameras").map((c) => (c.id === id ? { ...c, ...patch } : c))); },
  remove(id: string) { write("cameras", read("cameras").filter((c) => c.id !== id)); },
};

export const sightings = {
  add(...s: Omit<Sighting, "id">[]) {
    if (!s.length) return;
    write("sightings", [...s.map((x) => ({ ...x, id: uid("s") })).reverse(), ...read("sightings")]);
  },
  remove(id: string) { write("sightings", read("sightings").filter((s) => s.id !== id)); },
  clear() { write("sightings", []); write("scans", []); },
};

export const scans = {
  add(s: Omit<Scan, "id">) {
    const scan = { ...s, id: uid("scan") };
    write("scans", [scan, ...read("scans")]);
    return scan;
  },
  update(id: string, patch: Partial<Scan>) { write("scans", read("scans").map((s) => (s.id === id ? { ...s, ...patch } : s))); },
};

/* ---------------------------------------------------------------- demo data */
const DEMO_FLAG = "straywatch:v1:demo-seeded";

/** Add sample records (all flagged `demo`). Real records are kept. */
export function loadDemo(d: { cameras: CameraCfg[]; sightings: Sighting[]; scans: Scan[] }) {
  removeDemo();
  const byTime = <T extends { at: string }>(a: T, b: T) => b.at.localeCompare(a.at);
  write("cameras", [...read("cameras"), ...d.cameras]);
  write("scans", [...read("scans"), ...d.scans].sort(byTime));
  write("sightings", [...read("sightings"), ...d.sightings].sort(byTime));
  try { localStorage.setItem(DEMO_FLAG, "1"); } catch { /* ignore */ }
}
/** Remove every sample record and leave real detections untouched. */
export function removeDemo() {
  write("cameras", read("cameras").filter((c) => !c.demo));
  write("scans", read("scans").filter((s) => !s.demo));
  write("sightings", read("sightings").filter((s) => !s.demo));
}
/** True the first time this browser opens the site with nothing saved. */
export function shouldAutoSeed() {
  try {
    return !localStorage.getItem(DEMO_FLAG) && !read("cameras").length && !read("sightings").length && !read("scans").length;
  } catch {
    return false;
  }
}

export function exportAll() {
  return JSON.stringify({ app: "straywatch", version: 1, exportedAt: new Date().toISOString(), cameras: read("cameras"), sightings: read("sightings"), scans: read("scans") }, null, 1);
}

/** Merge an export from another device. Records already present (same id) are skipped. */
export function importAll(text: string) {
  const d = JSON.parse(text);
  if (d?.app !== "straywatch") throw new Error("This is not a StrayWatch export file.");
  const merge = <T extends { id: string }>(mine: T[], theirs: unknown): T[] => {
    if (!Array.isArray(theirs)) return mine;
    const ids = new Set(mine.map((x) => x.id));
    return [...mine, ...(theirs as T[]).filter((x) => x && typeof x.id === "string" && !ids.has(x.id))];
  };
  const byTime = <T extends { at: string }>(a: T, b: T) => b.at.localeCompare(a.at);
  const cams = merge(read("cameras"), d.cameras);
  const sights = merge(read("sightings"), d.sightings).sort(byTime);
  const sc = merge(read("scans"), d.scans).sort(byTime);
  const added = sights.length - read("sightings").length;
  write("cameras", cams); write("sightings", sights); write("scans", sc);
  return added;
}
