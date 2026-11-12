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

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

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

export async function fetchAttractors(bounds: { s: number; w: number; n: number; e: number }, signal?: AbortSignal): Promise<Attractor[]> {
  const body = "data=" + encodeURIComponent(query(bounds.s, bounds.w, bounds.n, bounds.e));
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal });
      if (!r.ok) throw new Error(`OpenStreetMap lookup failed (${r.status}${r.status === 429 ? ": too many requests, wait a minute" : ""})`);
      const d: { elements: El[] } = await r.json();
      const out: Attractor[] = [];
      for (const el of d.elements) {
        const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        const c = el.tags && classify(el.tags);
        if (lat === undefined || lng === undefined || !c) continue;
        out.push({ id: `${el.type}/${el.id}`, kind: c.kind, tag: c.tag, lat, lng, name: el.tags?.name || el.tags?.["name:en"] || ATTRACTOR_META[c.kind].label });
      }
      return out;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenStreetMap lookup failed");
}
