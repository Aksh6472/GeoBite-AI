/**
 * Dog-bite counts per ward from the GeoBite-AI platform, joined with what StrayWatch has seen.
 *
 * The browser calls /api/geobite/bites, which next.config.ts forwards to GeoBite-AI's public
 * endpoint (so no CORS change is needed there). If that fails, a bundled copy is used.
 */

import { BITES_SNAPSHOT, BITES_SNAPSHOT_AT } from "./bitesSnapshot";
import { areaEstimate, distanceM } from "./geo";
import type { CameraCfg, Scan, Sighting } from "./store";

export type BiteWard = { ward: string; district: string; lat: number; lng: number; bites: number | null; suppressed: boolean };
export type BiteData = { wards: BiteWard[]; threshold: number; source: "live" | "snapshot"; asOf: string };

export async function fetchBites(signal?: AbortSignal): Promise<BiteData> {
  try {
    const r = await fetch("/api/geobite/bites", { signal, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (!Array.isArray(d.wards)) throw new Error("bad shape");
    return { wards: d.wards, threshold: d.suppression_threshold ?? 3, source: "live", asOf: new Date().toISOString() };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { wards: BITES_SNAPSHOT.wards, threshold: BITES_SNAPSHOT.suppression_threshold, source: "snapshot", asOf: BITES_SNAPSHOT_AT };
  }
}

/** Sightings within this distance of a ward's centre count towards that ward. */
export const WARD_RADIUS_M = 1500;

export type Level = "High" | "Medium" | "Low";
export type WardRow = BiteWard & {
  dogsLow: number; dogsHigh: number; sightings: number; cameras: number; scans: number;
  score: number; level: Level; note: string;
};

/**
 * Rank wards by bites and dogs together. Each is scaled 0-1 against the busiest ward, then
 * score = 60% bites + 40% dogs (bites weigh more: they are the outcome that matters).
 * Wards with bites but no camera get a note, because their dog numbers are unknown, not zero.
 */
export function rankWards(wards: BiteWard[], sightings: Sighting[], scans: Scan[], cameras: CameraCfg[], threshold = 3): WardRow[] {
  const rows = wards.map((w) => {
    const c: [number, number] = [w.lat, w.lng];
    const near = sightings.filter((s) => distanceM(c, [s.lat, s.lng]) <= WARD_RADIUS_M);
    const nearScans = scans.filter((s) => distanceM(c, [s.lat, s.lng]) <= WARD_RADIUS_M);
    const est = areaEstimate(near, nearScans);
    return { ...w, dogsLow: est.low, dogsHigh: est.high, sightings: near.length, scans: nearScans.length, cameras: cameras.filter((k) => distanceM(c, [k.lat, k.lng]) <= WARD_RADIUS_M).length };
  });
  const maxBites = Math.max(1, ...rows.map((r) => r.bites ?? 0));
  const maxDogs = Math.max(1, ...rows.map((r) => r.dogsLow));
  const out = rows.map((r) => {
    const b = (r.bites ?? 0) / maxBites, d = r.dogsLow / maxDogs;
    const watched = r.cameras > 0 || r.scans > 0;
    // Unwatched wards: score on bites alone, so a missing camera does not hide a bite hotspot.
    const score = watched ? 0.6 * b + 0.4 * d : b;
    const level: Level = score >= 0.55 ? "High" : score >= 0.3 ? "Medium" : "Low";
    const note = r.suppressed ? `Fewer than ${threshold} bites (hidden for privacy)`
      : !watched && (r.bites ?? 0) > 0 ? "Bites reported but no camera or scan here: dog numbers unknown"
      : b >= 0.5 && d >= 0.5 ? "Many bites and many dogs"
      : b >= 0.5 ? "Many bites, fewer dogs seen"
      : d >= 0.5 ? "Many dogs, fewer bites so far"
      : "";
    return { ...r, score, level, note };
  });
  return out.sort((a, b) => b.score - a.score || (b.bites ?? 0) - (a.bites ?? 0));
}
