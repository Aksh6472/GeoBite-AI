"use client";

import { useEffect, useRef } from "react";
import type { Box } from "@/lib/detector";

/** Draws a scanned image with its detections, scaled to fit the card. */
export function ScanResult({ image, boxes, label }: { image: HTMLCanvasElement | HTMLImageElement; boxes: Box[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const H = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    const scale = Math.min(1, 1600 / Math.max(W, H));
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0, c.width, c.height);
    const lw = Math.max(2, c.width / 400);
    for (const b of boxes) {
      const x = b.x * scale, y = b.y * scale, w = Math.max(b.w * scale, 6), h = Math.max(b.h * scale, 6);
      ctx.strokeStyle = "#ffb020"; ctx.lineWidth = lw;
      ctx.strokeRect(x - lw, y - lw, w + 2 * lw, h + 2 * lw);
      // Small dogs in big images are tiny: add a ring so each one is findable at a glance.
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.max(w, h) / 2 + 10 * lw, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,176,32,.8)"; ctx.lineWidth = lw * 0.75; ctx.stroke();
    }
  }, [image, boxes]);
  return <canvas ref={ref} role="img" aria-label={label} className="block h-auto w-full rounded-lg bg-black" />;
}
