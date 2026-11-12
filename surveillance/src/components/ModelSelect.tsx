"use client";

import { useSyncExternalStore } from "react";
import { type ModelKind, preferredModel, setPreferredModel } from "@/lib/detector";

const noop = () => () => {};

/** Detector choice, remembered per browser. Changing it reloads the page so every camera switches. */
export function ModelSelect() {
  const kind = useSyncExternalStore<ModelKind>(noop, preferredModel, () => "mobilenet_v2");
  return (
    <select aria-label="Detector" value={kind} onChange={(e) => { setPreferredModel(e.target.value as ModelKind); location.reload(); }}
      className="h-10 rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm text-ink focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100">
      <option value="mobilenet_v2">Detector: accurate (recommended)</option>
      <option value="lite_mobilenet_v2">Detector: fast (slow phones; misses more dogs)</option>
    </select>
  );
}
