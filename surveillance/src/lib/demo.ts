/**
 * Demo data so a first-time visitor sees a working example.
 *
 * Eight sample cameras at real Chennai locations (the same wards the GeoBite-AI seed uses),
 * two weeks of dog sightings with the morning and evening peaks street dogs show, plus drone
 * photo and satellite scans. Every record is flagged `demo` and is removed in one click.
 * Times are generated relative to now, so "last 24 hours" always has data.
 */

import type { CameraCfg, Scan, Sighting } from "./store";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAMERAS: { name: string; lat: number; lng: number; rate: number; pack: number }[] = [
  { name: "Pondy Bazaar market, T. Nagar", lat: 13.0412, lng: 80.2339, rate: 0.9, pack: 4 },
  { name: "Kapaleeshwarar tank, Mylapore", lat: 13.0336, lng: 80.2697, rate: 0.6, pack: 3 },
  { name: "Adyar bus depot", lat: 13.0063, lng: 80.2574, rate: 0.5, pack: 3 },
  { name: "Velachery MRTS station", lat: 12.979, lng: 80.221, rate: 0.7, pack: 4 },
  { name: "Fish market, Tondiarpet", lat: 13.125, lng: 80.288, rate: 1.4, pack: 7 },
  { name: "Kasimedu harbour, Royapuram", lat: 13.122, lng: 80.296, rate: 1.2, pack: 6 },
  { name: "Tower Park gate, Anna Nagar", lat: 13.0878, lng: 80.214, rate: 0.35, pack: 2 },
  { name: "Railway colony, Perambur", lat: 13.118, lng: 80.234, rate: 0.55, pack: 3 },
];

/** Relative activity by hour of day: dogs are most active at dawn and after dusk. */
const HOURLY = [0.6, 0.45, 0.35, 0.35, 0.6, 1.3, 1.9, 2.0, 1.6, 1.0, 0.7, 0.5, 0.35, 0.3, 0.35, 0.45, 0.7, 1.1, 1.6, 1.9, 1.8, 1.4, 1.0, 0.8];

const COATS = ["#6b4f2f", "#a07a4f", "#c9a477", "#3b2f25", "#2a2a2a", "#e8dcc6", "#8c5a2b"];
const GROUNDS = ["#7d8188", "#8f8a7e", "#6f7a72", "#9a9184"];

/** Small drawn picture of a dog so demo sightings have a thumbnail. */
function dogThumb(r: () => number) {
  const coat = COATS[Math.floor(r() * COATS.length)], ground = GROUNDS[Math.floor(r() * GROUNDS.length)];
  const flip = r() < 0.5 ? -1 : 1, lying = r() < 0.3;
  const body = lying
    ? `<ellipse cx="46" cy="62" rx="26" ry="10" fill="${coat}"/><ellipse cx="73" cy="60" rx="9" ry="7" fill="${coat}"/><ellipse cx="83" cy="63" rx="7" ry="4" fill="${coat}"/><circle cx="89" cy="62" r="1.8" fill="#111"/><path d="M68 55q-4 2-2 10q4-2 5-8z" fill="#00000055"/><path d="M20 64q-6 6 4 8" stroke="${coat}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<rect x="28" y="58" width="5" height="20" rx="2" fill="${coat}"/><rect x="38" y="58" width="5" height="20" rx="2" fill="${coat}"/><rect x="56" y="58" width="5" height="20" rx="2" fill="${coat}"/><rect x="65" y="58" width="5" height="20" rx="2" fill="${coat}"/><ellipse cx="48" cy="54" rx="25" ry="11" fill="${coat}"/><path d="M66 50q4-12 10-12" stroke="${coat}" stroke-width="9" fill="none" stroke-linecap="round"/><ellipse cx="77" cy="38" rx="8" ry="7" fill="${coat}"/><ellipse cx="86" cy="41" rx="7" ry="4" fill="${coat}"/><circle cx="92" cy="40" r="1.8" fill="#111"/><path d="M71 33q-4 2-3 11q4-2 5-9z" fill="#00000055"/><path d="M24 50q-10 2-13-8" stroke="${coat}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${ground}"/><rect y="70" width="96" height="26" fill="#00000022"/><g transform="translate(${flip < 0 ? 96 : 0} 0) scale(${flip} 1)">${body}</g><rect x="6" y="${lying ? 40 : 28}" width="84" height="${lying ? 36 : 54}" fill="none" stroke="#ffb020" stroke-width="2.5"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Poisson sample (small means). */
function poisson(mean: number, r: () => number) {
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

export function generateDemo(now = Date.now(), days = 14) {
  const r = mulberry32(2026);
  const iso = (t: number) => new Date(t).toISOString();
  const jitter = (lat: number, lng: number, m: number): [number, number] => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * m;
    return [lat + (d * Math.sin(a)) / 111320, lng + (d * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180))];
  };

  const cameras: CameraCfg[] = CAMERAS.map((c, i) => ({
    id: `demo-cam-${i + 1}`, name: c.name, kind: "stream", url: "demo", lat: c.lat, lng: c.lng, threshold: 0.5,
    createdAt: iso(now - days * 86400e3), demo: true,
  }));

  const sightings: Sighting[] = [];
  CAMERAS.forEach((c, i) => {
    let track = 1;
    // A slow rise over the fortnight, as numbers build up around a growing food source.
    for (let h = days * 24; h >= 1; h--) {
      const start = now - h * 3600e3;
      const hour = new Date(start).getHours();
      const growth = 0.8 + 0.4 * (1 - h / (days * 24));
      const n = poisson(c.rate * HOURLY[hour] * growth, r);
      for (let k = 0; k < n; k++) {
        const at = start + r() * 3600e3;
        if (at > now) continue;
        sightings.push({
          id: `demo-s-${i}-${track}`, at: iso(at), source: "camera", label: c.name, cameraId: cameras[i].id,
          lat: c.lat, lng: c.lng, score: Math.round((0.55 + r() * 0.4) * 100) / 100, trackId: track++,
          inView: Math.max(1, Math.min(c.pack, 1 + poisson(c.pack * 0.35, r))), demo: true,
        });
      }
    }
  });

  // Drone photos over the three busiest sites, and satellite scans of two wards.
  const scans: Scan[] = [];
  const aerial: [number, number, number, number, string][] = [
    [4, 13.1252, 80.2884, 14, "Drone photo, Tondiarpet fish market"],
    [2, 13.1218, 80.2958, 9, "Drone photo, Kasimedu harbour"],
    [1, 13.0414, 80.2336, 6, "Rooftop photo, Pondy Bazaar"],
  ];
  for (const [dAgo, lat, lng, dogs, label] of aerial) {
    const at = now - dAgo * 86400e3 - 3 * 3600e3;
    const id = `demo-scan-a-${scans.length}`;
    scans.push({ id, at: iso(at), kind: "aerial", label, lat, lng, dogs, widthPx: 4000, heightPx: 3000, demo: true });
    for (let k = 0; k < dogs; k++) sightings.push({ id: `${id}-${k}`, at: iso(at), source: "aerial", label, lat, lng, score: Math.round((0.6 + r() * 0.35) * 100) / 100, scanId: id, demo: true });
  }
  const sat: [number, number, number, number][] = [[5, 13.0063, 80.2574, 1], [3, 12.979, 80.221, 0]];
  for (const [dAgo, lat, lng, dogs] of sat) {
    const at = now - dAgo * 86400e3;
    const id = `demo-scan-s-${scans.length}`;
    scans.push({ id, at: iso(at), kind: "satellite", label: `Satellite scan ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng, bounds: [[lat - 0.0022, lng - 0.0034], [lat + 0.0022, lng + 0.0034]], dogs, widthPx: 2304, heightPx: 1536, metresPerPx: 0.29, demo: true });
    for (let k = 0; k < dogs; k++) {
      const [a, b] = jitter(lat, lng, 150);
      sightings.push({ id: `${id}-${k}`, at: iso(at), source: "satellite", label: "Satellite scan", lat: a, lng: b, score: 0.41, scanId: id, demo: true });
    }
  }

  sightings.sort((a, b) => b.at.localeCompare(a.at));
  // Pictures on the most recent sightings only (the store keeps thumbnails for the newest 400).
  sightings.slice(0, 160).forEach((s) => { s.thumb = dogThumb(r); });
  return { cameras, sightings, scans };
}
