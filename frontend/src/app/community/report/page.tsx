"use client";

import { Camera, CheckCircle2, ChevronDown, Copy, Crosshair, Info, Map as MapIcon, PenLine, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { LocationPicker } from "@/components/map";
import { Button, Card, CardHeader, cx, ErrorBanner, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { nowLocalInput } from "@/lib/format";
import { useGeoTree, useVocab } from "@/lib/hooks";

type Result = { report_code: string; status: string; ward: string | null; district: string; joined_existing_observation: boolean; message: string };
type Method = "gps" | "map" | "manual";

const BEHAVIOUR_HINT: Record<string, string> = { bite_reported: "Please also seek medical care at the nearest hospital or PHC.", needs_vet: "Veterinary teams review these reports first." };

export default function ReportDogs() {
  const vocab = useVocab();
  const { districts } = useGeoTree();
  const [method, setMethod] = useState<Method>("map");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState({ district_id: "", municipality_id: "", ward_id: "" });
  const [f, setF] = useState({ locality: "", street_landmark: "", observed_at: nowLocalInput(), total_dogs: "", description: "", contact_email: "", website: "" });
  const [pop, setPop] = useState({ estimated_locality_dogs: "", puppies: "", adults: "", injured: "", ear_notched: "", grouping: "" });
  const [showPop, setShowPop] = useState(false);
  const [beh, setBeh] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<ApiError | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const district = districts.find((d) => String(d.id) === geo.district_id);
  const munis = district?.children ?? [];
  const muni = munis.find((m) => String(m.id) === geo.municipality_id) ?? (munis.length === 1 ? munis[0] : undefined);
  const wards = muni?.children ?? [];


  const locate = async (lat: number, lng: number) => {
    setLoc({ lat, lng });
    try {
      const r = await api<Record<string, { id: number; name: string }>>("/geo/locate", { params: { lat, lng } });
      setGeo({ district_id: String(r.district?.id ?? ""), municipality_id: String(r.municipality?.id ?? ""), ward_id: String(r.ward?.id ?? "") });
      if (!f.locality && r.ward) setF((p) => ({ ...p, locality: r.ward.name }));
    } catch {
      setGpsMsg("This point is outside the configured pilot wards. Please choose your district and ward below.");
    }
  };
  const useGps = () => {
    setMethod("gps");
    if (!navigator.geolocation) return setGpsMsg("GPS is not available on this device.");
    setGpsMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGpsMsg("Location captured."); locate(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); },
      () => setGpsMsg("Location permission was denied. Pick the spot on the map or enter it manually."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const wardCentre = () => {
    const w = wards.find((x) => String(x.id) === geo.ward_id);
    return w ? { lat: w.lat, lng: w.lng } : null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let point = loc;
    if (method === "manual" && !point) point = wardCentre();
    if (!geo.district_id) return setErr("Please select your district.");
    if (!point) return setErr(method === "manual" ? "Please select your ward so the report can be placed on the map." : "Please select the location on the map, use GPS, or switch to manual entry.");
    if (f.total_dogs === "") return setErr("Please enter the approximate number of dogs you saw.");
    if (!consent) return setErr("Please confirm the consent statement to submit.");
    const num = (s: string) => (s === "" ? null : Number(s));
    const payload = {
      district_id: Number(geo.district_id), municipality_id: num(geo.municipality_id), ward_id: num(geo.ward_id),
      locality: f.locality || null, street_landmark: f.street_landmark || null, latitude: point.lat, longitude: point.lng, location_method: method,
      observed_at: new Date(f.observed_at).toISOString(), description: f.description || null,
      dogs: { total_dogs: Number(f.total_dogs), estimated_locality_dogs: num(pop.estimated_locality_dogs), puppies: num(pop.puppies), adults: num(pop.adults), injured: num(pop.injured), ear_notched: num(pop.ear_notched), grouping: pop.grouping || null },
      behaviours: Object.entries(beh).map(([category, description]) => ({ category, description: description || null })),
      consent, contact_email: f.contact_email || null, website: f.website,
    };
    const fd = new FormData();
    fd.append("payload", JSON.stringify(payload));
    if (photo) fd.append("photo", photo);
    setBusy(true);
    try {
      const r = await api<Result>("/community/reports", { method: "POST", body: fd });
      setResult(r);
      window.scrollTo({ top: 0 });
    } catch (e2) {
      const ae = e2 as ApiError;
      const code = (ae.data as { report_code?: string })?.report_code;
      setErr(code ? `${ae.message} Your report ID is ${code}.` : ae);
      top.current?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-7 text-center">
          <CheckCircle2 className="mx-auto size-12 text-sage-500" strokeWidth={1.6} />
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">Report received</h1>
          <p className="mt-2 text-sm text-muted">{result.message}</p>
          <div className="mx-auto mt-6 max-w-xs rounded-xl border border-line bg-canvas p-4">
            <p className="text-xs text-muted">Your report ID</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-navy-900">{result.report_code}</p>
            <button onClick={() => { navigator.clipboard?.writeText(result.report_code); setCopied(true); }} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700"><Copy className="size-3.5" />{copied ? "Copied" : "Copy ID"}</button>
          </div>
          <p className="mt-4 text-[13px] text-muted">{result.ward ? `${result.ward}, ` : ""}{result.district}. Status: <strong>received</strong>.</p>
          {result.joined_existing_observation && <p className="mx-auto mt-3 max-w-sm rounded-lg bg-teal-50 px-3 py-2 text-[12.5px] text-teal-700">Other residents recently reported dogs at this spot. Your report was grouped with theirs so the same dogs are not counted twice.</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LinkButton href={`/community/track?code=${result.report_code}`} variant="secondary"><SearchCheck className="size-4" />Track status</LinkButton>
            <LinkButton href="/community" variant="secondary"><MapIcon className="size-4" />View community map</LinkButton>
            <Button variant="teal" onClick={() => window.location.reload()}>Submit another</Button>
          </div>
        </Card>
      </div>
    );
  }

  const methodBtn = (m: Method, label: string, Icon: React.ElementType, onClick?: () => void) => (
    <button type="button" onClick={onClick ?? (() => setMethod(m))} className={cx("flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-medium", method === m ? "border-teal-600 bg-teal-50 text-teal-700" : "border-line bg-white text-navy-700")}>
      <Icon className="size-4" />{label}
    </button>
  );
  const num = (k: keyof typeof pop) => ({ id: k, type: "number", min: 0, inputMode: "numeric" as const, value: pop[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPop({ ...pop, [k]: e.target.value }) });

  return (
    <div className="mx-auto max-w-3xl" ref={top}>
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900 md:text-3xl">Report dogs in your area</h1>
      <p className="mt-1 text-sm text-muted">Your observation helps veterinary and municipal teams plan vaccination, sterilisation and care. It takes about two minutes. No account needed.</p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        {err && <ErrorBanner error={err} />}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />

        <Card>
          <CardHeader title="Where did you see the dogs?" />
          <div className="space-y-4 p-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              {methodBtn("gps", "Use my GPS location", Crosshair, useGps)}
              {methodBtn("map", "Pick on map", MapIcon)}
              {methodBtn("manual", "Enter manually", PenLine)}
            </div>
            {gpsMsg && <p className="text-xs text-muted">{gpsMsg}</p>}
            {method !== "manual" && (
              <div className="overflow-hidden rounded-xl border border-line">
                <LocationPicker value={loc} onChange={(a, b) => { setMethod(method === "gps" ? "gps" : "map"); locate(a, b); }} focus={district ? [district.lat, district.lng] : null} className="h-[300px]" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="District" htmlFor="district" required><Select id="district" placeholder="Select district" value={geo.district_id} options={districts.map((d) => ({ value: d.id, label: d.name }))} onChange={(e) => { const ms = districts.find((d) => String(d.id) === e.target.value)?.children ?? []; setGeo({ district_id: e.target.value, municipality_id: ms.length === 1 ? String(ms[0].id) : "", ward_id: "" }); }} /></Field>
              <Field label="City / municipality" htmlFor="muni"><Select id="muni" placeholder="Select" disabled={!district} value={geo.municipality_id} options={munis.map((m) => ({ value: m.id, label: m.name }))} onChange={(e) => setGeo({ ...geo, municipality_id: e.target.value, ward_id: "" })} /></Field>
              <Field label="Ward number" htmlFor="ward" required={method === "manual"} hint={method === "manual" ? "Used to place your report at the ward centre" : "Detected from the map when possible"}><Select id="ward" placeholder="Select ward" disabled={!muni} value={geo.ward_id} options={wards.map((w) => ({ value: w.id, label: `Ward ${w.ward_number} · ${w.name}` }))} onChange={(e) => setGeo({ ...geo, ward_id: e.target.value })} /></Field>
              <Field label="Locality" htmlFor="locality"><Input id="locality" maxLength={120} value={f.locality} onChange={(e) => setF({ ...f, locality: e.target.value })} /></Field>
              <Field label="Street / landmark" htmlFor="street" className="sm:col-span-2" hint="A public landmark is enough. Please do not enter your house address."><Input id="street" maxLength={200} value={f.street_landmark} onChange={(e) => setF({ ...f, street_landmark: e.target.value })} placeholder="e.g. Near bus stop, opposite temple" /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="What did you see?" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Approximate number of dogs observed" htmlFor="total" required><Input id="total" type="number" inputMode="numeric" min={0} max={500} value={f.total_dogs} onChange={(e) => setF({ ...f, total_dogs: e.target.value })} /></Field>
            <Field label="Date and time of observation" htmlFor="obs" required><Input id="obs" type="datetime-local" max={nowLocalInput()} value={f.observed_at} onChange={(e) => setF({ ...f, observed_at: e.target.value })} /></Field>
            <Field label="Photograph (optional)" htmlFor="photo" className="sm:col-span-2" hint="JPEG, PNG or WEBP up to 5 MB. Location data inside the photo is removed on upload. Avoid photographing people or house numbers.">
              <label htmlFor="photo" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-canvas px-4 py-3 text-sm text-navy-700 hover:border-navy-400">
                <Camera className="size-5 text-muted" />{photo ? photo.name : "Choose a photo or take one"}
              </label>
              <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Additional description (optional)" htmlFor="desc" className="sm:col-span-2"><Textarea id="desc" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Report dog behaviour" subtitle="Select everything you observed. These are recorded as observations and reviewed by authorised officers." />
          <div className="p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {vocab?.behaviours.map((b) => {
                const on = b.value in beh;
                return (
                  <label key={b.value} className={cx("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-[13.5px]", on ? "border-teal-600 bg-teal-50/60" : "border-line hover:border-navy-300")}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-teal-600" checked={on} onChange={() => setBeh((s) => { const n = { ...s }; if (on) delete n[b.value]; else n[b.value] = ""; return n; })} />
                    <span>{b.label}{on && BEHAVIOUR_HINT[b.value] && <span className="mt-0.5 block text-xs text-alert-orange">{BEHAVIOUR_HINT[b.value]}</span>}</span>
                  </label>
                );
              })}
            </div>
            {Object.keys(beh).length > 0 && (
              <div className="mt-4 space-y-3">
                {Object.keys(beh).filter((k) => !["peaceful_roaming", "resting"].includes(k)).map((k) => (
                  <Field key={k} label={`What happened: ${vocab?.behaviours.find((b) => b.value === k)?.label.toLowerCase()}`} htmlFor={`b-${k}`}>
                    <Input id={`b-${k}`} maxLength={1000} value={beh[k]} onChange={(e) => setBeh({ ...beh, [k]: e.target.value })} placeholder="Optional short description" />
                  </Field>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <button type="button" onClick={() => setShowPop(!showPop)} className="flex w-full items-center justify-between px-5 py-4 text-left">
            <span><span className="block text-[15px] font-semibold text-ink">Dog population details (optional)</span><span className="text-[13px] text-muted">Puppies, adults, injured dogs and ear-notched dogs</span></span>
            <ChevronDown className={cx("size-5 text-muted transition", showPop && "rotate-180")} />
          </button>
          {showPop && (
            <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-3">
              <Field label="Estimated dogs in the locality" htmlFor="estimated_locality_dogs"><Input {...num("estimated_locality_dogs")} /></Field>
              <Field label="Puppies" htmlFor="puppies"><Input {...num("puppies")} /></Field>
              <Field label="Adult dogs" htmlFor="adults"><Input {...num("adults")} /></Field>
              <Field label="Visibly injured dogs" htmlFor="injured"><Input {...num("injured")} /></Field>
              <Field label="Dogs with an ear-notch" htmlFor="ear_notched" hint="An ear-notch usually marks sterilisation. It does not prove current vaccination."><Input {...num("ear_notched")} /></Field>
              <Field label="Were they together?" htmlFor="grouping"><Select id="grouping" placeholder="Select" value={pop.grouping} options={vocab?.grouping ?? []} onChange={(e) => setPop({ ...pop, grouping: e.target.value })} /></Field>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <Field label="Email for status updates (optional)" htmlFor="email" hint="Never shown publicly or shared. You can also track your report with its ID."><Input id="email" type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></Field>
          <label className="flex items-start gap-3 rounded-lg bg-navy-50 p-3 text-[13px] text-navy-800">
            <input type="checkbox" className="mt-0.5 size-4 accent-navy-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I consent to GeoBite-AI storing this observation for public-health and animal-welfare purposes. I understand that the exact location is visible only to authorised officers, that public maps show it aggregated to roughly 500 m, and that reports are reviewed before being treated as verified.</span>
          </label>
          <p className="flex items-start gap-2 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />If someone has been bitten, wash the wound with soap and running water and go to the nearest hospital or PHC. In an emergency call 108.</p>
          <Button type="submit" variant="teal" size="lg" className="w-full" loading={busy}>Submit report</Button>
          <p className="text-center text-xs text-muted">Already reported? <Link href="/community/track" className="font-medium text-teal-700">Track your report</Link></p>
        </Card>
      </form>
    </div>
  );
}
