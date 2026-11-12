"use client";

import { Crosshair, Loader2 } from "lucide-react";
import { useState } from "react";
import type { LatLng } from "@/lib/geo";
import { DogMap } from "./map";
import { Button, Input } from "./ui";

export function LocationPicker({ value, onChange, basemap = "street", height = "h-[260px]" }: { value: LatLng | null; onChange: (p: LatLng) => void; basemap?: "street" | "satellite"; height?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [fit, setFit] = useState("");

  const gps = () => {
    if (!navigator.geolocation) return setErr("This browser cannot share its location.");
    setBusy(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onChange([p.coords.latitude, p.coords.longitude]); setFit(String(Date.now())); },
      (e) => { setBusy(false); setErr(e.code === 1 ? "Location permission denied. Click the camera's spot on the map instead." : "Could not get your location. Click the spot on the map instead."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const typed = () => {
    const m = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return setErr("Type the location as latitude, longitude, for example 13.0418, 80.2341");
    const p: LatLng = [Number(m[1]), Number(m[2])];
    if (Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) return setErr("Those coordinates are out of range.");
    setErr(""); onChange(p); setFit(String(Date.now()));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={gps} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Crosshair className="size-3.5" />}Use this device&apos;s location</Button>
        <div className="flex min-w-[220px] flex-1 gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); typed(); } }} placeholder="or type lat, lng" className="h-8 text-[13px]" aria-label="Latitude, longitude" />
          <Button type="button" variant="secondary" size="sm" onClick={typed}>Set</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <DogMap basemap={basemap} height={height} pin={value} onClick={(p) => { setErr(""); onChange(p); }} center={value ?? undefined} zoom={value ? 17 : 5}
          focus={value && fit ? { at: value, zoom: 17, key: fit } : null} />
      </div>
      <p className="text-xs text-muted">{value ? <>Selected <span className="font-mono">{value[0].toFixed(5)}, {value[1].toFixed(5)}</span>. Click the map to move it.</> : "Click the map where the camera is (zoom in for accuracy)."}</p>
      {err && <p className="text-xs font-medium text-alert-red" role="alert">{err}</p>}
    </div>
  );
}
