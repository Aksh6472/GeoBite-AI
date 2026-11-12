/**
 * Places that attract free-roaming dogs, from OpenStreetMap (Overpass API, ODbL).
 *
 * These are mapped features, not dog counts: they show where dogs are likely to gather
 * (food waste, meat, cooked food, shelter) so cameras and scans can be aimed there.
 */

export type AttractorKind = "waste" | "meat" | "food" | "market" | "vacant" | "transport";
export type Attractor = { id: string; kind: AttractorKind; name: string; lat: number; lng: number; tag: string };

export const ATTRACTOR_META: Record<AttractorKind, { label: string; color: string; weight: number; why: string }> = {
  waste: { label: "Garbage / waste site", color: "#b45309", weight: 3, why: "open food waste is the main food source for street dogs" },
  meat: { label: "Meat, fish or slaughter", color: "#c0392b", weight: 3, why: "offal and scraps" },
  market: { label: "Market", color: "#7c3aed", weight: 2, why: "food scraps and daytime crowds" },
  food: { label: "Food stall / eatery", color: "#d9701c", weight: 1, why: "leftovers and feeding by people" },
  vacant: { label: "Vacant or scrub land", color: "#5b8a68", weight: 1, why: "shelter and denning" },
  transport: { label: "Bus / rail station", color: "#34598c", weight: 1, why: "food vendors and shelter" },
};

// Public Overpass mirrors. They are often overloaded, so all are asked at once and the first
// good answer wins.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const TIMEOUT_MS = 15_000;
const CACHE_PREFIX = "straywatch:osm:";
const CACHE_DAYS = 14;

function query(s: number, w: number, n: number, e: number) {
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:25];(
nwr["landuse"="landfill"]${b};nwr["amenity"~"^(waste_disposal|waste_transfer_station|recycling)$"]${b};nwr["amenity"="waste_basket"]["waste"~"organic"]${b};
nwr["shop"~"^(butcher|seafood|poultry)$"]${b};nwr["industrial"="slaughterhouse"]${b};nwr["craft"="slaughterhouse"]${b};nwr["amenity"="animal_slaughter"]${b};
nwr["amenity"="marketplace"]${b};nwr["shop"="greengrocer"]${b};
nwr["amenity"~"^(fast_food|food_court)$"]${b};
nwr["landuse"~"^(brownfield|greenfield)$"]${b};nwr["natural"="scrub"]${b};
nwr["amenity"="bus_station"]${b};nwr["railway"="station"]${b};
);out center 600;`;
}

function classify(t: Record<string, string>): { kind: AttractorKind; tag: string } | null {
  if (t.landuse === "landfill") return { kind: "waste", tag: "landuse=landfill" };
  if (t.amenity && /waste|recycling/.test(t.amenity)) return { kind: "waste", tag: `amenity=${t.amenity}` };
  if (t.shop && /butcher|seafood|poultry/.test(t.shop)) return { kind: "meat", tag: `shop=${t.shop}` };
  if (t.industrial === "slaughterhouse" || t.craft === "slaughterhouse" || t.amenity === "animal_slaughter") return { kind: "meat", tag: "slaughterhouse" };
  if (t.amenity === "marketplace" || t.shop === "greengrocer") return { kind: "market", tag: t.amenity ? `amenity=${t.amenity}` : `shop=${t.shop}` };
  if (t.amenity === "fast_food" || t.amenity === "food_court") return { kind: "food", tag: `amenity=${t.amenity}` };
  if (t.landuse === "brownfield" || t.landuse === "greenfield" || t.natural === "scrub") return { kind: "vacant", tag: t.landuse ? `landuse=${t.landuse}` : "natural=scrub" };
  if (t.amenity === "bus_station" || t.railway === "station") return { kind: "transport", tag: t.amenity ? "amenity=bus_station" : "railway=station" };
  return null;
}

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
type Bounds = { s: number; w: number; n: number; e: number };
export type AttractorResult = { items: Attractor[]; source: "live" | "cache" | "snapshot"; at: string };

export function parseElements(elements: El[]): Attractor[] {
  const out: Attractor[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    const c = el.tags && classify(el.tags);
    if (lat === undefined || lng === undefined || !c) continue;
    out.push({ id: `${el.type}/${el.id}`, kind: c.kind, tag: c.tag, lat, lng, name: el.tags?.name || el.tags?.["name:en"] || ATTRACTOR_META[c.kind].label });
  }
  return out;
}

const within = (b: Bounds) => (a: Attractor) => a.lat >= b.s && a.lat <= b.n && a.lng >= b.w && a.lng <= b.e;
/** Cache key: bounds snapped to ~1 km so small pans reuse the same answer. */
const key = (b: Bounds) => CACHE_PREFIX + [b.s, b.w, b.n, b.e].map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(",");

function readCache(b: Bounds): AttractorResult | null {
  try {
    const raw = localStorage.getItem(key(b));
    if (!raw) return null;
    const d = JSON.parse(raw) as { at: string; items: Attractor[] };
    if (Date.now() - Date.parse(d.at) > CACHE_DAYS * 86400e3) return null;
    return { items: d.items.filter(within(b)), source: "cache", at: d.at };
  } catch { return null; }
}
function writeCache(b: Bounds, items: Attractor[]) {
  try { localStorage.setItem(key(b), JSON.stringify({ at: new Date().toISOString(), items })); } catch { /* full: skip */ }
}

async function ask(url: string, body: string, signal: AbortSignal): Promise<Attractor[]> {
  const r = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal });
  if (!r.ok) throw new Error(`OpenStreetMap lookup failed (${r.status})`);
  const d: { elements?: El[]; remark?: string } = await r.json();
  if (!d.elements) throw new Error(d.remark || "OpenStreetMap returned no data");
  return parseElements(d.elements);
}

/** The bundled copy for these bounds, if they overlap the area it covers (else null). */
export async function snapshotFor(b: Bounds): Promise<AttractorResult | null> {
  const { OSM_SNAPSHOT } = await import("./osmSnapshot");
  const sb = OSM_SNAPSHOT.bounds;
  const overlaps = b.s < sb.n && b.n > sb.s && b.w < sb.e && b.e > sb.w;
  return overlaps && OSM_SNAPSHOT.items.length ? { items: OSM_SNAPSHOT.items.filter(within(b)), source: "snapshot", at: OSM_SNAPSHOT.at } : null;
}

/**
 * Dog-attractor places in the bounds: this browser's cache first, then every Overpass mirror at
 * once, then the bundled snapshot (covers the demo area) if every mirror is down.
 */
export async function fetchAttractors(b: Bounds, signal?: AbortSignal): Promise<AttractorResult> {
  const cached = readCache(b);
  if (cached) return cached;
  const body = "data=" + encodeURIComponent(query(b.s, b.w, b.n, b.e));
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, TIMEOUT_MS);
  try {
    const items = await Promise.any(ENDPOINTS.map((u) => ask(u, body, ctl.signal)));
    writeCache(b, items);
    return { items, source: "live", at: new Date().toISOString() };
  } catch (e) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const snap = await snapshotFor(b);
    if (snap) return snap;
    throw new Error(e instanceof AggregateError ? "OpenStreetMap's lookup servers are busy right now. Try again in a minute." : (e as Error).message);
  } finally {
    clearTimeout(timer);
    ctl.abort(); // stop the slower mirrors once one has answered
    signal?.removeEventListener("abort", stop);
  }
}
