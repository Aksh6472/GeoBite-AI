"use client";

/**
 * Real dog detection in the browser.
 *
 * Uses the COCO-SSD object detector (TensorFlow.js, Apache-2.0), which knows the COCO
 * "dog" class. Everything runs on the viewer's device: frames never leave the browser.
 * The model weights (about 67 MB for "accurate", 18 MB for "fast") are downloaded once
 * from Google's public model bucket and then cached by the browser.
 *
 * "accurate" (SSD MobileNet v2) is the default: in testing on street-dog photos the "fast"
 * SSDLite model labelled clear dogs as "sheep" or "bear", so it is offered only as a fallback
 * for slow phones.
 */

import type { ObjectDetection } from "@tensorflow-models/coco-ssd";

export type Box = { x: number; y: number; w: number; h: number; score: number };
export type ModelKind = "lite_mobilenet_v2" | "mobilenet_v2";
export type Frame = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

const MODEL_KEY = "straywatch:model";
let current: { kind: ModelKind; model: Promise<ObjectDetection> } | null = null;

export function preferredModel(): ModelKind {
  try {
    return localStorage.getItem(MODEL_KEY) === "lite_mobilenet_v2" ? "lite_mobilenet_v2" : "mobilenet_v2";
  } catch {
    return "mobilenet_v2";
  }
}
export function setPreferredModel(kind: ModelKind) {
  try { localStorage.setItem(MODEL_KEY, kind); } catch { /* private mode: keep default */ }
  current = null;
}

export function loadDetector(kind: ModelKind = preferredModel()): Promise<ObjectDetection> {
  if (current && current.kind === kind) return current.model;
  const model = (async () => {
    const tf = await import("@tensorflow/tfjs-core");
    await import("@tensorflow/tfjs-backend-webgl");
    await import("@tensorflow/tfjs-backend-cpu");
    try {
      if (!(await tf.setBackend("webgl"))) await tf.setBackend("cpu");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    const coco = await import("@tensorflow-models/coco-ssd");
    return coco.load({ base: kind });
  })();
  current = { kind, model };
  model.catch(() => { if (current?.model === model) current = null; });
  return model;
}

/** Detection calls are serialised so several cameras share the GPU without fighting over it. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Dogs in one frame, in the frame's own pixel coordinates. */
export function detectDogs(frame: Frame, minScore = 0.5): Promise<Box[]> {
  return serial(async () => {
    const m = await loadDetector();
    const preds = await m.detect(frame, 30, minScore);
    return preds.filter((p) => p.class === "dog").map((p) => ({ x: p.bbox[0], y: p.bbox[1], w: p.bbox[2], h: p.bbox[3], score: p.score }));
  });
}

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Non-maximum suppression: drop boxes that mostly overlap a higher-scoring one. */
export function nms(boxes: Box[], threshold = 0.4): Box[] {
  const out: Box[] = [];
  for (const b of [...boxes].sort((p, q) => q.score - p.score)) {
    // Also treat a box that sits almost entirely inside a kept box as a duplicate (tile seams).
    if (out.some((k) => iou(k, b) > threshold || containment(b, k) > 0.8)) continue;
    out.push(b);
  }
  return out;
}
function containment(inner: Box, outer: Box) {
  const x1 = Math.max(inner.x, outer.x), y1 = Math.max(inner.y, outer.y);
  const x2 = Math.min(inner.x + inner.w, outer.x + outer.w), y2 = Math.min(inner.y + inner.h, outer.y + outer.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inner.w * inner.h > 0 ? inter / (inner.w * inner.h) : 0;
}

/**
 * Sliding-window detection for large images (drone photos, stitched satellite tiles).
 * COCO-SSD resizes its input to 300x300, so small dogs in a big image vanish. Cutting the
 * image into overlapping windows gives every dog more pixels at the model's input.
 */
export async function detectTiled(
  image: HTMLCanvasElement | HTMLImageElement,
  { window: win, overlap = 0.25, minScore = 0.4, wholeImage = true, onProgress, signal }: {
    window: number; overlap?: number; minScore?: number; wholeImage?: boolean;
    onProgress?: (done: number, total: number) => void; signal?: AbortSignal;
  },
): Promise<Box[]> {
  const W = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const H = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const size = Math.min(win, W, H);
  const step = Math.max(1, Math.floor(size * (1 - overlap)));
  const xs = starts(W, size, step), ys = starts(H, size, step);
  const total = xs.length * ys.length + (wholeImage ? 1 : 0);
  const crop = document.createElement("canvas");
  crop.width = crop.height = size;
  const ctx = crop.getContext("2d", { willReadFrequently: true })!;
  const found: Box[] = [];
  let done = 0;

  if (wholeImage) {
    found.push(...(await detectDogs(image as Frame, minScore)));
    onProgress?.(++done, total);
  }
  for (const y of ys) {
    for (const x of xs) {
      if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(image, x, y, size, size, 0, 0, size, size);
      for (const b of await detectDogs(crop, minScore)) {
        // A box touching a cut edge of the window is a dog sliced by the window (often just its
        // head). The neighbouring window or the whole-image pass sees that dog in full, so skip it.
        const m = Math.max(2, size * 0.02);
        const cut = (b.x < m && x > 0) || (b.y < m && y > 0) || (b.x + b.w > size - m && x + size < W) || (b.y + b.h > size - m && y + size < H);
        if (!cut) found.push({ ...b, x: b.x + x, y: b.y + y });
      }
      onProgress?.(++done, total);
    }
  }
  return nms(found);
}
function starts(len: number, size: number, step: number) {
  const out: number[] = [];
  for (let p = 0; p + size < len; p += step) out.push(p);
  out.push(Math.max(0, len - size));
  return [...new Set(out)];
}

/** Small JPEG crop of one detection, for the sightings log. */
export function thumbnail(frame: Frame, b: Box, px = 96): string | undefined {
  try {
    const pad = 0.15;
    const sx = b.x - b.w * pad, sy = b.y - b.h * pad, sw = b.w * (1 + 2 * pad), sh = b.h * (1 + 2 * pad);
    const scale = px / Math.max(sw, sh);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    c.getContext("2d")!.drawImage(frame, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.65);
  } catch {
    return undefined; // tainted canvas (cross-origin frame): log the sighting without a picture
  }
}

