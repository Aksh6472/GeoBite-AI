"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

type Params = Record<string, string | number | boolean | null | undefined>;

/** Fetch JSON from the API; re-fetches when path/params change. Previous data is kept while
 * a new request is in flight (so maps and tables do not flash empty). */
export function useApi<T>(path: string | null, params?: Params) {
  const [tick, setTick] = useState(0);
  const key = path ? `${path}${JSON.stringify(params ?? {})}#${tick}` : null;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: ApiError | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    api<T>(path, { params })
      .then((d) => { if (!cancelled) setState({ key, data: d, error: null }); })
      .catch((e) => { if (!cancelled) setState((s) => ({ key, data: s.data, error: e as ApiError })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((d: T) => setState((s) => ({ ...s, data: d })), []);
  return { data: state.data, error: state.error, loading: !!key && state.key !== key, reload, setData };
}

// ---------------------------------------------------------------- reference data (cached)
export type Option = { value: string; label: string; description?: string };
export type Vocab = Record<string, Option[]> & {
  concern_behaviours: string[];
  behaviour_layer_groups: Record<string, string[]>;
  alert_transitions: Record<string, string[]>;
};
export type GeoNode = { id: number; name: string; code: string; level: string; ward_number: number | null; lat: number; lng: number; children?: GeoNode[] };

const cache: Record<string, Promise<unknown>> = {};
function cached<T>(path: string): Promise<T> {
  if (!cache[path]) cache[path] = api<T>(path).catch((e) => { delete cache[path]; throw e; });
  return cache[path] as Promise<T>;
}

export function useVocab() {
  const [v, setV] = useState<Vocab | null>(null);
  useEffect(() => { cached<Vocab>("/meta/vocab").then(setV).catch(() => {}); }, []);
  return v;
}

export function useGeoTree() {
  const [t, setT] = useState<GeoNode[] | null>(null);
  useEffect(() => { cached<GeoNode[]>("/geo/tree").then(setT).catch(() => {}); }, []);
  const state = t?.[0];
  const districts = state?.children ?? [];
  return { state, districts, loaded: !!t };
}

export function labelOf(v: Vocab | null, group: string, value?: string | null) {
  if (!value) return "-";
  return v?.[group]?.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}
