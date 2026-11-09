"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Empty, ErrorBanner, Field, Input, PageHeader, Select, Skeleton, Table, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNum, fmtPct, todayISO } from "@/lib/format";
import { useApi, useGeoTree, useVocab } from "@/lib/hooks";

type Rec = { id: number; ward: string; district: string; campaign_name: string; start_date: string; end_date: string | null; dogs_vaccinated: number; estimated_dog_population: number | null; estimation_method: string; data_source: string | null; verification_status: string; coverage: number | null; is_synthetic: boolean };

export default function Vaccination() {
  const { user } = useAuth();
  const vocab = useVocab();
  const { districts } = useGeoTree();
  const { data, error, loading, reload } = useApi<Rec[]>("/vaccination");
  const canRecord = user && ["super_admin", "veterinary_officer", "municipal_officer"].includes(user.role);
  const canConfirm = user && ["super_admin", "veterinary_officer"].includes(user.role);
  const [open, setOpen] = useState(false);
  const wards = districts.flatMap((d) => (d.children ?? []).flatMap((m) => (m.children ?? []).map((w) => ({ value: w.id, label: `${w.name} · ${d.name}` }))));
  const [f, setF] = useState({ ward_id: "", campaign_name: "", start_date: todayISO(), end_date: "", dogs_vaccinated: "", estimated_dog_population: "", estimation_method: "documented_survey", data_source: "", verification_status: "unverified", notes: "" });
  const [err, setErr] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/vaccination", { method: "POST", json: { ...f, ward_id: Number(f.ward_id), dogs_vaccinated: Number(f.dogs_vaccinated), estimated_dog_population: f.estimated_dog_population ? Number(f.estimated_dog_population) : null, end_date: f.end_date || null, data_source: f.data_source || null, notes: f.notes || null } });
      setOpen(false);
      reload();
    } catch (x) { setErr(x as Error); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Vaccination records" subtitle="Coverage is calculated only from confirmed records backed by a documented population survey. Drive records without a survey show vaccination activity, not coverage. Ear-notches are not treated as proof of vaccination." actions={canRecord && <Button onClick={() => setOpen(!open)}><Plus className="size-4" />Record vaccination drive</Button>} />
      {open && (
        <Card className="mb-5">
          <CardHeader title="New vaccination record" />
          <form onSubmit={submit} className="grid gap-4 p-5 md:grid-cols-3">
            <div className="md:col-span-3"><ErrorBanner error={err} /></div>
            <Field label="Ward" htmlFor="w" required><Select id="w" placeholder="Select ward" value={f.ward_id} options={wards} onChange={(e) => setF({ ...f, ward_id: e.target.value })} /></Field>
            <Field label="Campaign name" htmlFor="c" required className="md:col-span-2"><Input id="c" value={f.campaign_name} onChange={(e) => setF({ ...f, campaign_name: e.target.value })} /></Field>
            <Field label="Start date" htmlFor="s" required><Input id="s" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
            <Field label="End date" htmlFor="e"><Input id="e" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
            <Field label="Dogs vaccinated" htmlFor="v" required><Input id="v" type="number" min={0} value={f.dogs_vaccinated} onChange={(e) => setF({ ...f, dogs_vaccinated: e.target.value })} /></Field>
            <Field label="Estimation method" htmlFor="m"><Select id="m" value={f.estimation_method} options={vocab?.vax_methods ?? []} onChange={(e) => setF({ ...f, estimation_method: e.target.value })} /></Field>
            <Field label="Surveyed dog population" htmlFor="p" required={f.estimation_method === "documented_survey"} hint="From the documented survey (e.g. mark-resight)"><Input id="p" type="number" min={1} value={f.estimated_dog_population} onChange={(e) => setF({ ...f, estimated_dog_population: e.target.value })} /></Field>
            <Field label="Data source" htmlFor="ds"><Input id="ds" value={f.data_source} onChange={(e) => setF({ ...f, data_source: e.target.value })} /></Field>
            {canConfirm && <Field label="Verification" htmlFor="vs"><Select id="vs" value={f.verification_status} options={[{ value: "unverified", label: "Unverified" }, { value: "confirmed", label: "Confirmed by me" }]} onChange={(e) => setF({ ...f, verification_status: e.target.value })} /></Field>}
            <Field label="Notes" htmlFor="n" className="md:col-span-3"><Textarea id="n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div className="md:col-span-3"><Button type="submit" loading={busy}>Save record</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <ErrorBanner error={error} />
        {loading && !data ? <div className="p-4"><Skeleton className="h-64" /></div> : !data?.length ? <Empty title="No vaccination records" /> : (
          <Table head={["Ward", "Campaign", "Dates", "Vaccinated", "Survey population", "Coverage", "Method", "Status", ""]}>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium">{r.ward}<span className="block text-xs font-normal text-muted">{r.district}</span></td>
                <td className="max-w-[240px] px-4 py-2.5">{r.campaign_name}<span className="block truncate text-xs text-muted">{r.data_source}</span></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDate(r.start_date)}{r.end_date && ` to ${fmtDate(r.end_date)}`}</td>
                <td className="px-4 py-2.5 font-mono">{fmtNum(r.dogs_vaccinated)}</td>
                <td className="px-4 py-2.5 font-mono">{fmtNum(r.estimated_dog_population)}</td>
                <td className="px-4 py-2.5 font-mono">{r.coverage === null ? <span className="font-sans text-xs text-muted">no survey</span> : fmtPct(r.coverage)}</td>
                <td className="px-4 py-2.5 text-xs">{r.estimation_method === "documented_survey" ? "Documented survey" : "Drive record only"}</td>
                <td className="px-4 py-2.5"><Badge tone={r.verification_status === "confirmed" ? "green" : "gray"}>{r.verification_status}</Badge></td>
                <td className="px-4 py-2.5">{canConfirm && r.verification_status !== "confirmed" && <Button size="sm" variant="secondary" onClick={async () => { await api(`/vaccination/${r.id}/confirm`, { method: "POST" }); reload(); }}><ShieldCheck className="size-3.5" />Confirm</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
