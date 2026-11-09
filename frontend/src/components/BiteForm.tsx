"use client";

import { Crosshair, Info, MapPin } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useGeoTree, useVocab } from "@/lib/hooks";
import { LocationPicker } from "./map";
import { Button, Card, CardHeader, ErrorBanner, Field, Input, Select, Textarea } from "./ui";

export type BiteValues = Record<string, string | number | null>;

const DEFAULTS: BiteValues = {
  incident_date: todayISO(), incident_time_approx: "", hospital_report_date: todayISO(), district_id: "", municipality_id: "", ward_id: "",
  location_description: "", latitude: "", longitude: "", location_type: "", persons_affected: 1, victim_age_group: "", victim_sex: "not_collected",
  circumstances: "", dog_ownership: "", provocation: "not_assessed", injury_category: "not_assessed", body_part: "", clinical_assessment_status: "pending",
  wound_management_status: "not_started", pep_status: "not_referred", rig_status: "pending", follow_up_status: "pending", follow_up_due_date: "", clinical_notes: "",
};

const REQUIRED = ["incident_date", "hospital_report_date", "district_id", "latitude", "longitude", "location_type", "victim_age_group", "dog_ownership"];

export function BiteForm({ initial, submitLabel, onSubmit, extra, hospitalSelect }: { initial?: BiteValues; submitLabel: string; onSubmit: (body: BiteValues) => Promise<void>; extra?: React.ReactNode; hospitalSelect?: React.ReactNode }) {
  const vocab = useVocab();
  const { districts } = useGeoTree();
  const [v, setV] = useState<BiteValues>({ ...DEFAULTS, ...initial });
  const [err, setErr] = useState<ApiError | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);

  const district = districts.find((d) => String(d.id) === String(v.district_id));
  const munis = district?.children ?? [];
  const muni = munis.find((m) => String(m.id) === String(v.municipality_id));
  const wards = muni?.children ?? [];
  const set = (k: string, val: string | number | null) => setV((p) => ({ ...p, [k]: val }));
  const inp = (k: string) => ({ id: k, value: (v[k] ?? "") as string, "aria-invalid": !!(local[k] || err?.fields?.[k]), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value) });
  const fe = (k: string) => local[k] || err?.fields?.[k];
  const opts = (g: string) => vocab?.[g] ?? [];


  const pick = async (lat: number, lng: number) => {
    setV((p) => ({ ...p, latitude: lat, longitude: lng }));
    try {
      const r = await api<Record<string, { id: number }>>("/geo/locate", { params: { lat, lng } });
      setV((p) => ({ ...p, latitude: lat, longitude: lng, district_id: r.district?.id ?? p.district_id, municipality_id: r.municipality?.id ?? p.municipality_id, ward_id: r.ward?.id ?? p.ward_id }));
    } catch {
      /* outside configured wards: user selects manually */
    }
  };
  const gps = () => {
    if (!navigator.geolocation) return setGpsMsg("GPS is not available in this browser.");
    setGpsMsg("Locating…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGpsMsg(null); pick(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); },
      () => setGpsMsg("Could not get your location. Select it on the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const wardFocus: [number, number] | null = (() => {
    const w = wards.find((x) => String(x.id) === String(v.ward_id));
    if (w) return [w.lat, w.lng];
    if (district) return [district.lat, district.lng];
    return null;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const miss: Record<string, string> = {};
    REQUIRED.forEach((k) => { if (v[k] === "" || v[k] === null) miss[k] = "Required"; });
    if (!v.latitude) miss.location = "Select the incident location on the map or use GPS";
    setLocal(miss);
    if (Object.keys(miss).length) {
      document.getElementById(Object.keys(miss)[0])?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const body: BiteValues = {};
    Object.entries(v).forEach(([k, val]) => { body[k] = val === "" ? null : val; });
    ["district_id", "municipality_id", "ward_id", "persons_affected"].forEach((k) => { if (body[k] !== null) body[k] = Number(body[k]); });
    body.latitude = Number(body.latitude);
    body.longitude = Number(body.longitude);
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(body);
    } catch (e2) {
      setErr(e2 as ApiError);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {err && <ErrorBanner error={err} />}

      <Card>
        <CardHeader title="A. Incident details" subtitle="When and where the bite occurred. The incident ID is generated on submission." />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="Date of incident" htmlFor="incident_date" required error={fe("incident_date")}><Input type="date" max={todayISO()} {...inp("incident_date")} /></Field>
          <Field label="Approximate time" htmlFor="incident_time_approx"><Select placeholder="Select" options={opts("time_approx")} {...inp("incident_time_approx")} /></Field>
          <Field label="Date of hospital reporting" htmlFor="hospital_report_date" required error={fe("hospital_report_date")}><Input type="date" max={todayISO()} {...inp("hospital_report_date")} /></Field>
          {hospitalSelect}
          <Field label="District" htmlFor="district_id" required error={fe("district_id")}>
            <Select placeholder="Select district" options={districts.map((d) => ({ value: d.id, label: d.name }))} {...inp("district_id")} onChange={(e) => {
              const ms = districts.find((d) => String(d.id) === e.target.value)?.children ?? [];
              setV((p) => ({ ...p, district_id: e.target.value, municipality_id: ms.length === 1 ? ms[0].id : "", ward_id: "" }));
            }} />
          </Field>
          <Field label="City / municipality" htmlFor="municipality_id">
            <Select placeholder="Select municipality" disabled={!district} options={munis.map((m) => ({ value: m.id, label: m.name }))} {...inp("municipality_id")} onChange={(e) => setV((p) => ({ ...p, municipality_id: e.target.value, ward_id: "" }))} />
          </Field>
          <Field label="Ward / locality" htmlFor="ward_id" hint="Filled automatically from the map pin">
            <Select placeholder="Select ward" disabled={!muni} options={wards.map((w) => ({ value: w.id, label: `${w.name} (Ward ${w.ward_number})` }))} {...inp("ward_id")} />
          </Field>
          <Field label="Location type" htmlFor="location_type" required error={fe("location_type")}><Select placeholder="Select" options={opts("location_types")} {...inp("location_type")} /></Field>
          <Field label="Exact incident location" htmlFor="location_description" className="md:col-span-2"><Input placeholder="Street, landmark or description" maxLength={300} {...inp("location_description")} /></Field>
        </div>
        <div className="grid gap-4 border-t border-line p-5 lg:grid-cols-[1fr_260px]">
          <div className="overflow-hidden rounded-xl border border-line" id="location">
            <LocationPicker value={v.latitude ? { lat: Number(v.latitude), lng: Number(v.longitude) } : null} onChange={pick} focus={wardFocus} />
          </div>
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-[13px] text-muted"><MapPin className="mt-0.5 size-4 shrink-0 text-teal-600" />Click the map at the incident location. District and ward are detected automatically.</p>
            <Button type="button" variant="secondary" className="w-full" onClick={gps}><Crosshair className="size-4" />Use current GPS location</Button>
            {gpsMsg && <p className="text-xs text-muted">{gpsMsg}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude" htmlFor="latitude" error={fe("latitude")}><Input inputMode="decimal" {...inp("latitude")} /></Field>
              <Field label="Longitude" htmlFor="longitude" error={fe("longitude")}><Input inputMode="decimal" {...inp("longitude")} /></Field>
            </div>
            {fe("location") && <p className="text-xs font-medium text-alert-red">{fe("location")}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="B. Bite incident details" subtitle="Collect only what approved surveillance protocols require." />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="People affected in this incident" htmlFor="persons_affected"><Input type="number" min={1} max={100} {...inp("persons_affected")} /></Field>
          <Field label="Age group of the victim" htmlFor="victim_age_group" required error={fe("victim_age_group")}><Select placeholder="Select" options={opts("age_groups")} {...inp("victim_age_group")} /></Field>
          <Field label="Sex" htmlFor="victim_sex" hint="Only if collected under approved protocols"><Select options={opts("sex")} {...inp("victim_sex")} /></Field>
          <Field label="Dog was" htmlFor="dog_ownership" required error={fe("dog_ownership")}><Select placeholder="Select" options={opts("dog_ownership")} {...inp("dog_ownership")} /></Field>
          <Field label="Provoked / unprovoked" htmlFor="provocation" hint="If clinically or epidemiologically assessed"><Select options={opts("provocation")} {...inp("provocation")} /></Field>
          <Field label="Injury category" htmlFor="injury_category"><Select options={opts("injury_category")} {...inp("injury_category")} /></Field>
          <Field label="Body part affected" htmlFor="body_part"><Select placeholder="Not recorded" options={opts("body_part")} {...inp("body_part")} /></Field>
          <Field label="Circumstances of the incident" htmlFor="circumstances" className="md:col-span-2"><Textarea maxLength={2000} placeholder="Brief description. Do not include names or contact details." {...inp("circumstances")} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="C. Clinical information" subtitle="Reporting fields only. Clinical decisions remain with the treating medical professional under national guidelines." />
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="Clinical assessment status" htmlFor="clinical_assessment_status"><Select options={opts("clinical_assessment")} {...inp("clinical_assessment_status")} /></Field>
          <Field label="Wound-management status" htmlFor="wound_management_status"><Select options={opts("wound_management")} {...inp("wound_management_status")} /></Field>
          <Field label="Rabies vaccine / PEP status" htmlFor="pep_status"><Select options={opts("pep_status")} {...inp("pep_status")} /></Field>
          <Field label="Immunoglobulin status" htmlFor="rig_status"><Select options={opts("rig_status")} {...inp("rig_status")} /></Field>
          <Field label="Follow-up status" htmlFor="follow_up_status"><Select options={opts("follow_up")} {...inp("follow_up_status")} /></Field>
          <Field label="Next follow-up due" htmlFor="follow_up_due_date"><Input type="date" {...inp("follow_up_due_date")} /></Field>
          <Field label="Additional clinical notes" htmlFor="clinical_notes" className="md:col-span-3" hint="Visible only to authorised clinical users. Never shown on maps or public dashboards."><Textarea maxLength={4000} {...inp("clinical_notes")} /></Field>
        </div>
        <p className="mx-5 mb-5 flex items-start gap-2 rounded-lg bg-navy-50 px-3 py-2.5 text-[12.5px] text-navy-800"><Info className="mt-0.5 size-4 shrink-0" />GeoBite-AI does not provide diagnosis or treatment recommendations. Patient names, phone numbers and addresses are not collected.</p>
      </Card>

      {extra}
      <div className="flex justify-end gap-3"><Button type="submit" size="lg" loading={busy}>{submitLabel}</Button></div>
    </form>
  );
}
