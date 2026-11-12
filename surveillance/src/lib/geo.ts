import type { Scan, Sighting } from "./store";

export type LatLng = [number, number];

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Web Mercator tile maths (the scheme every slippy-map imagery service uses). */
export const TILE = 256;
export function lngToPx(lng: number, z: number) { return ((lng + 180) / 360) * TILE * 2 ** z; }
export function latToPx(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}
export function pxToLng(x: number, z: number) { return (x / (TILE * 2 ** z)) * 360 - 180; }
export function pxToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
/** Ground size of one pixel, in metres, at this latitude and zoom. */
export function metresPerPx(lat: number, z: number) { return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z; }

export const WINDOWS = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, all: Infinity } as const;
export type WindowKey = keyof typeof WINDOWS;
export const WINDOW_LABEL: Record<WindowKey, string> = { "1h": "Last hour", "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };
export const inWindow = (iso: string, w: WindowKey, now = Date.now()) => now - Date.parse(iso) <= WINDOWS[w];

/**
 * How many dogs are in an area, from what the cameras and image scans saw.
 *
 * - low:  the most dogs any single source saw at one moment, summed across cameras, plus the
 *         biggest single image scan. These are distinct dogs, so it is a floor.
 * - high: every distinct camera track plus the biggest image scan. The same dog walking past
 *         twice counts twice, so it is a ceiling.
 */
export function areaEstimate(rows: Sighting[], scanList: Scan[]) {
  const peak = new Map<string, number>(), tracks = new Map<string, number>(), perScan = new Map<string, number>();
  for (const s of rows) {
    if (s.source === "camera" && s.cameraId) {
      peak.set(s.cameraId, Math.max(peak.get(s.cameraId) ?? 0, s.inView ?? 1));
      tracks.set(s.cameraId, (tracks.get(s.cameraId) ?? 0) + 1);
    } else if (s.scanId) {
      perScan.set(s.scanId, (perScan.get(s.scanId) ?? 0) + 1);
    }
  }
  const camLow = [...peak.values()].reduce((a, b) => a + b, 0);
  const camHigh = [...tracks.values()].reduce((a, b) => a + b, 0);
  const scanMax = Math.max(0, ...perScan.values());
  return { low: camLow + scanMax, high: camHigh + scanMax, cameras: peak.size, scans: scanList.length, scanMax, camHigh };
}

/** Group sightings into roughly `cellM`-metre squares for the map. */
export function gridCells(rows: Sighting[], cellM = 120) {
  const cells = new Map<string, { lat: number; lng: number; n: number; last: string; sources: Set<string> }>();
  for (const s of rows) {
    const dLat = cellM / 111320, dLng = cellM / (111320 * Math.cos((s.lat * Math.PI) / 180));
    const i = Math.floor(s.lat / dLat), j = Math.floor(s.lng / dLng);
    const k = `${i}:${j}`;
    const c = cells.get(k) ?? { lat: (i + 0.5) * dLat, lng: (j + 0.5) * dLng, n: 0, last: s.at, sources: new Set<string>() };
    c.n++;
    if (s.at > c.last) c.last = s.at;
    c.sources.add(s.label);
    cells.set(k, c);
  }
  return [...cells.values()];
}

export function fmtLatLng(lat: number, lng: number) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
