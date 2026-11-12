import { type Box, iou } from "./detector";

export type Track = { id: number; box: Box; hits: number; misses: number; confirmed: boolean; firstSeen: number; lastSeen: number; best: Box };

/**
 * Minimal multi-object tracker so one dog walking past a camera counts once, not once per frame.
 * Greedy matching on box overlap, with a centre-distance fallback because detection runs at a
 * few frames per second and a running dog can jump further than its own width between frames.
 * A track counts as a dog only after `minHits` detections, which filters one-frame false positives.
 */
export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  constructor(private minHits = 3, private maxMisses = 6) {}

  update(boxes: Box[], now = Date.now()): { active: Track[]; confirmedNow: Track[] } {
    const pairs: { t: number; b: number; s: number }[] = [];
    this.tracks.forEach((t, ti) =>
      boxes.forEach((b, bi) => {
        const o = iou(t.box, b);
        const dx = t.box.x + t.box.w / 2 - (b.x + b.w / 2), dy = t.box.y + t.box.h / 2 - (b.y + b.h / 2);
        const near = Math.hypot(dx, dy) < 1.2 * Math.max(t.box.w, t.box.h, b.w, b.h);
        const s = o > 0.1 ? o + 1 : near ? 1 - Math.hypot(dx, dy) / (2 * Math.max(t.box.w, b.w, 1)) : -1;
        if (s > 0) pairs.push({ t: ti, b: bi, s });
      }),
    );
    pairs.sort((p, q) => q.s - p.s);
    const usedT = new Set<number>(), usedB = new Set<number>();
    const confirmedNow: Track[] = [];
    for (const p of pairs) {
      if (usedT.has(p.t) || usedB.has(p.b)) continue;
      usedT.add(p.t); usedB.add(p.b);
      const t = this.tracks[p.t], b = boxes[p.b];
      t.box = b; t.hits++; t.misses = 0; t.lastSeen = now;
      if (b.score > t.best.score) t.best = b;
      if (!t.confirmed && t.hits >= this.minHits) { t.confirmed = true; confirmedNow.push(t); }
    }
    this.tracks.forEach((t, i) => { if (!usedT.has(i)) t.misses++; });
    this.tracks = this.tracks.filter((t) => t.misses <= (t.confirmed ? this.maxMisses : 1));
    boxes.forEach((b, i) => {
      if (usedB.has(i)) return;
      const t: Track = { id: this.nextId++, box: b, best: b, hits: 1, misses: 0, confirmed: this.minHits <= 1, firstSeen: now, lastSeen: now };
      this.tracks.push(t);
      if (t.confirmed) confirmedNow.push(t);
    });
    return { active: this.tracks.filter((t) => t.confirmed && t.misses === 0), confirmedNow };
  }

  reset() { this.tracks = []; }
}
