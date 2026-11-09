"use client";

import { ArrowLeft, ClipboardCheck, HandHeart, History, ListChecks, ShieldAlert, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, cx, ErrorBanner, Field, Input, PageHeader, Select, Skeleton, STATUS_TONE, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ADMIN_ROLES, useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, nowLocalInput } from "@/lib/format";
import { labelOf, useApi, useVocab } from "@/lib/hooks";

type Detail = {
  id: number; alert_code: string; title: string; ward: string; ward_number: number; municipality: string; district: string; district_id: number; alert_type_label: string; severity: string;
  status: string; status_label: string; evidence: Record<string, unknown>; assigned_to: { id: number; name: string; role: string } | null; generated_by: string; due_date: string | null;
  created_at: string; closed_at: string | null; closure_notes: string | null; is_synthetic: boolean; allowed_transitions: string[];
  inspections: { id: number; inspector: string; inspected_at: string; dogs_counted: number | null; dogs_injured_or_sick: number | null; ear_notched_count: number | null; report_outcome: string; behaviour_findings: string | null; environmental_findings: string | null; findings: string }[];
  interventions: { id: number; intervention_type: string; label: string; description: string | null; status: string; performed_by: string | null; started_at: string | null; completed_at: string | null; dogs_vaccinated: number | null; dogs_sterilised: number | null; dogs_treated: number | null }[];
  history: { action: string; actor: string; role: string; changes: Record<string, unknown> | null; reason: string | null; at: string }[];
};
const STAGES = ["new", "under_review", "field_verification_required", "verified", "intervention_assigned", "action_completed", "closed"];

function EvidenceValue({ v }: { v: unknown }) {
  if (Array.isArray(v)) return <span className="font-mono text-xs">{v.join(", ") || "-"}</span>;
  if (v && typeof v === "object") return <span className="flex flex-wrap gap-1">{Object.entries(v as Record<string, unknown>).map(([k, x]) => <Badge key={k} tone="navy">{k.replace(/_/g, " ")}: {String(x)}</Badge>)}</span>;
  return <span className="font-medium">{String(v)}</span>;
}

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const vocab = useVocab();
  const { data: a, error, setData, reload } = useApi<Detail>(`/alerts/${id}`);
  const officers = useApi<{ id: number; name: string; role_name: string; district: string; designation: string | null }[]>(a ? "/officers" : null, { district_id: a?.district_id });
  const [err, setErr] = useState<Error | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState({ assigned_to_id: "", due_date: "", note: "" });
  const [note, setNote] = useState("");
  const [insp, setInsp] = useState({ inspected_at: nowLocalInput(), dogs_counted: "", dogs_injured_or_sick: "", ear_notched_count: "", report_outcome: "confirmed", behaviour_findings: "", environmental_findings: "", findings: "", verify_linked_reports: true });
  const [intv, setIntv] = useState({ intervention_type: "anti_rabies_vaccination", description: "", status: "planned", started_at: "" });

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const canAct = !!a && a.status !== "closed" && (isAdmin || a.assigned_to?.id === user?.id);
  const run = async (key: string, fn: () => Promise<Detail>) => {
    setBusy(key);
    setErr(null);
    try { setData(await fn()); } catch (e) { setErr(e as Error); } finally { setBusy(null); }
  };
  const n = (s: string) => (s === "" ? null : Number(s));

  if (!a) return error ? <ErrorBanner error={error} /> : <Skeleton className="h-[600px]" />;
  const stageIdx = STAGES.indexOf(a.status);

  return (
    <>
      <Link href="/console/alerts" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-800"><ArrowLeft className="size-4" />All alerts</Link>
      <PageHeader title={a.title} subtitle={<>{a.alert_code} · {a.alert_type_label} · {a.ward} (Ward {a.ward_number}), {a.municipality}, {a.district} · raised {fmtDateTime(a.created_at)} by {a.generated_by}</>} actions={<><Badge tone={STATUS_TONE[a.severity]} className="h-7 px-3 text-xs">{a.severity} severity</Badge><Badge tone={STATUS_TONE[a.status]} className="h-7 px-3 text-xs">{a.status_label}</Badge></>} />
      <ErrorBanner error={err} />

      <Card className="mb-6 overflow-x-auto p-4">
        <ol className="flex min-w-[720px] items-center">
          {STAGES.map((s, i) => (
            <li key={s} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span className={cx("grid size-7 place-items-center rounded-full border-2 text-[11px] font-semibold", i < stageIdx || a.status === "closed" ? "border-teal-600 bg-teal-600 text-white" : i === stageIdx ? "border-navy-700 bg-white text-navy-800" : "border-line bg-white text-muted")}>{i + 1}</span>
                <span className={cx("max-w-[96px] text-[11.5px] leading-tight", i === stageIdx ? "font-semibold text-navy-900" : "text-muted")}>{labelOf(vocab, "alert_status", s)}</span>
              </div>
              {i < STAGES.length - 1 && <span className={cx("mx-1 mb-5 h-0.5 flex-1", i < stageIdx ? "bg-teal-600" : "bg-line")} />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Evidence" icon={ShieldAlert} subtitle="Captured by the rule that generated this alert. Refreshed when rules are re-evaluated." />
            <dl className="divide-y divide-line px-5">
              {Object.entries(a.evidence).filter(([k]) => k !== "evaluated_at").map(([k, v]) => (
                <div key={k} className="grid gap-1 py-2.5 text-[13.5px] sm:grid-cols-[220px_1fr]"><dt className="text-muted">{k.replace(/_/g, " ")}</dt><dd><EvidenceValue v={v} /></dd></div>
              ))}
            </dl>
            {"evaluated_at" in a.evidence && <p className="border-t border-line px-5 py-2 text-xs text-muted">Last evaluated {fmtDateTime(String(a.evidence.evaluated_at))}</p>}
          </Card>

          <Card>
            <CardHeader title="Field inspections" icon={ClipboardCheck} subtitle="Findings recorded by the veterinary or municipal officer" />
            <div className="divide-y divide-line">
              {a.inspections.length === 0 && <p className="px-5 py-4 text-sm text-muted">No inspection recorded yet.</p>}
              {a.inspections.map((i) => (
                <div key={i.id} className="px-5 py-4 text-[13.5px]">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={i.report_outcome === "confirmed" ? "green" : i.report_outcome === "not_confirmed" ? "gray" : "yellow"}>{labelOf(vocab, "inspection_outcomes", i.report_outcome)}</Badge><span className="text-muted">{i.inspector} · {fmtDateTime(i.inspected_at)}</span></div>
                  <p className="mt-2">{i.findings}</p>
                  <p className="mt-1 text-xs text-muted">Dogs counted: {i.dogs_counted ?? "-"} · injured/sick: {i.dogs_injured_or_sick ?? "-"} · ear-notched: {i.ear_notched_count ?? "-"}</p>
                  {i.behaviour_findings && <p className="mt-1 text-xs"><span className="text-muted">Behaviour:</span> {i.behaviour_findings}</p>}
                  {i.environmental_findings && <p className="mt-1 text-xs"><span className="text-muted">Environment:</span> {i.environmental_findings}</p>}
                </div>
              ))}
            </div>
            {canAct && (
              <form className="grid gap-3 border-t border-line bg-canvas/50 p-5 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run("insp", () => api<Detail>(`/alerts/${id}/inspections`, { method: "POST", json: { ...insp, inspected_at: new Date(insp.inspected_at).toISOString(), dogs_counted: n(insp.dogs_counted), dogs_injured_or_sick: n(insp.dogs_injured_or_sick), ear_notched_count: n(insp.ear_notched_count), behaviour_findings: insp.behaviour_findings || null, environmental_findings: insp.environmental_findings || null } }).then((r) => { setInsp((p) => ({ ...p, dogs_counted: "", dogs_injured_or_sick: "", ear_notched_count: "", behaviour_findings: "", environmental_findings: "", findings: "" })); return r; })); }}>
                <p className="text-[13px] font-semibold text-navy-900 sm:col-span-3">Record inspection</p>
                <Field label="Inspected at" htmlFor="ia"><Input id="ia" type="datetime-local" value={insp.inspected_at} onChange={(e) => setInsp({ ...insp, inspected_at: e.target.value })} /></Field>
                <Field label="Outcome" htmlFor="io"><Select id="io" value={insp.report_outcome} options={vocab?.inspection_outcomes ?? []} onChange={(e) => setInsp({ ...insp, report_outcome: e.target.value })} /></Field>
                <Field label="Dogs counted" htmlFor="dc"><Input id="dc" type="number" min={0} value={insp.dogs_counted} onChange={(e) => setInsp({ ...insp, dogs_counted: e.target.value })} /></Field>
                <Field label="Injured / sick dogs" htmlFor="di"><Input id="di" type="number" min={0} value={insp.dogs_injured_or_sick} onChange={(e) => setInsp({ ...insp, dogs_injured_or_sick: e.target.value })} /></Field>
                <Field label="Ear-notched dogs" htmlFor="de"><Input id="de" type="number" min={0} value={insp.ear_notched_count} onChange={(e) => setInsp({ ...insp, ear_notched_count: e.target.value })} /></Field>
                <Field label="Environmental findings" htmlFor="ef"><Input id="ef" value={insp.environmental_findings} onChange={(e) => setInsp({ ...insp, environmental_findings: e.target.value })} placeholder="Waste, feeding points" /></Field>
                <Field label="Behaviour findings" htmlFor="bf" className="sm:col-span-3"><Input id="bf" value={insp.behaviour_findings} onChange={(e) => setInsp({ ...insp, behaviour_findings: e.target.value })} /></Field>
                <Field label="Findings" htmlFor="fi" required className="sm:col-span-3"><Textarea id="fi" value={insp.findings} onChange={(e) => setInsp({ ...insp, findings: e.target.value })} /></Field>
                <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" className="size-4 accent-navy-700" checked={insp.verify_linked_reports} onChange={(e) => setInsp({ ...insp, verify_linked_reports: e.target.checked })} />Mark community reports cited in the evidence as verified</label>
                <Button type="submit" loading={busy === "insp"}>Save inspection</Button>
              </form>
            )}
          </Card>

          <Card>
            <CardHeader title="Humane interventions" icon={HandHeart} subtitle="Vaccination, ABC, veterinary care, environmental management and awareness only" />
            <div className="divide-y divide-line">
              {a.interventions.length === 0 && <p className="px-5 py-4 text-sm text-muted">No interventions recorded yet.</p>}
              {a.interventions.map((i) => (
                <div key={i.id} className="flex flex-wrap items-start gap-3 px-5 py-4 text-[13.5px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.label}</p>
                    {i.description && <p className="text-muted">{i.description}</p>}
                    <p className="mt-1 text-xs text-muted">{i.performed_by ?? "-"} · started {fmtDate(i.started_at)}{i.completed_at ? ` · completed ${fmtDate(i.completed_at)}` : ""}{i.dogs_vaccinated ? ` · ${i.dogs_vaccinated} vaccinated` : ""}{i.dogs_sterilised ? ` · ${i.dogs_sterilised} sterilised` : ""}{i.dogs_treated ? ` · ${i.dogs_treated} treated` : ""}</p>
                  </div>
                  {canAct ? (
                    <Select aria-label="Intervention status" className="h-9 w-40 text-[13px]" value={i.status} options={[{ value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]}
                      onChange={(e) => {
                        const status = e.target.value;
                        let extra = {};
                        if (status === "completed" && i.intervention_type === "anti_rabies_vaccination") { const v = window.prompt("Dogs vaccinated in this drive?", String(i.dogs_vaccinated ?? "")); if (v) extra = { dogs_vaccinated: Number(v) }; }
                        if (status === "completed" && i.intervention_type === "abc_sterilisation") { const v = window.prompt("Dogs sterilised?", String(i.dogs_sterilised ?? "")); if (v) extra = { dogs_sterilised: Number(v) }; }
                        run("int" + i.id, () => api<Detail>(`/interventions/${i.id}`, { method: "PATCH", json: { status, ...extra } }));
                      }} />
                  ) : <Badge tone={STATUS_TONE[i.status]}>{i.status.replace(/_/g, " ")}</Badge>}
                </div>
              ))}
            </div>
            {canAct && (
              <form className="grid gap-3 border-t border-line bg-canvas/50 p-5 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run("intv", () => api<Detail>(`/alerts/${id}/interventions`, { method: "POST", json: { ...intv, description: intv.description || null, started_at: intv.started_at || null } }).then((r) => { setIntv((p) => ({ ...p, description: "" })); return r; })); }}>
                <Field label="Intervention" htmlFor="it" className="sm:col-span-2"><Select id="it" value={intv.intervention_type} options={vocab?.intervention_types ?? []} onChange={(e) => setIntv({ ...intv, intervention_type: e.target.value })} /></Field>
                <Field label="Status" htmlFor="is"><Select id="is" value={intv.status} options={[{ value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }]} onChange={(e) => setIntv({ ...intv, status: e.target.value })} /></Field>
                <Field label="Start date" htmlFor="isd"><Input id="isd" type="date" value={intv.started_at} onChange={(e) => setIntv({ ...intv, started_at: e.target.value })} /></Field>
                <Field label="Description" htmlFor="idesc" className="sm:col-span-3"><Input id="idesc" value={intv.description} onChange={(e) => setIntv({ ...intv, description: e.target.value })} /></Field>
                <div className="flex items-end"><Button type="submit" className="w-full" loading={busy === "intv"}>Add intervention</Button></div>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Assignment" icon={UserCheck} />
            <div className="p-5 text-[13.5px]">
              {a.assigned_to ? <p><span className="font-medium">{a.assigned_to.name}</span><span className="block text-xs text-muted">{a.assigned_to.role}{a.due_date ? ` · due ${fmtDate(a.due_date)}` : ""}</span></p> : <p className="text-muted">Not yet assigned.</p>}
              {isAdmin && a.status !== "closed" && (
                <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); run("assign", () => api<Detail>(`/alerts/${id}/assign`, { method: "POST", json: { assigned_to_id: Number(assign.assigned_to_id), due_date: assign.due_date || null, note: assign.note || null } })); }}>
                  <Field label="Assign to veterinary / municipal officer" htmlFor="ao"><Select id="ao" placeholder="Select officer" value={assign.assigned_to_id} options={(officers.data ?? []).map((o) => ({ value: o.id, label: `${o.name} · ${o.role_name} (${o.district})` }))} onChange={(e) => setAssign({ ...assign, assigned_to_id: e.target.value })} /></Field>
                  <Field label="Due date" htmlFor="ad"><Input id="ad" type="date" value={assign.due_date} onChange={(e) => setAssign({ ...assign, due_date: e.target.value })} /></Field>
                  <Field label="Instructions" htmlFor="an"><Input id="an" value={assign.note} onChange={(e) => setAssign({ ...assign, note: e.target.value })} /></Field>
                  <Button type="submit" className="w-full" disabled={!assign.assigned_to_id} loading={busy === "assign"}>{a.assigned_to ? "Reassign" : "Assign"}</Button>
                </form>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Update status" icon={ListChecks} subtitle="Allowed next stages for this alert" />
            <div className="space-y-3 p-5">
              {a.status === "closed" ? (
                <div className="text-[13.5px]"><p className="font-medium">Closed {fmtDateTime(a.closed_at)}</p><p className="mt-1 text-muted">{a.closure_notes}</p></div>
              ) : canAct ? (
                <>
                  <Field label="Note for the audit record" htmlFor="sn" hint="Required when closing an alert"><Textarea id="sn" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" /></Field>
                  <div className="flex flex-wrap gap-2">
                    {a.allowed_transitions.filter((s) => s !== "closed" || isAdmin).map((s) => (
                      <Button key={s} size="sm" variant={s === "closed" ? "secondary" : "primary"} loading={busy === s} onClick={() => run(s, () => api<Detail>(`/alerts/${id}/status`, { method: "POST", json: { status: s, note: note || null } }).then((r) => { setNote(""); return r; }))}>
                        {labelOf(vocab, "alert_status", s)}
                      </Button>
                    ))}
                    {isAdmin && !a.allowed_transitions.includes("closed") && <Button size="sm" variant="secondary" onClick={() => run("closed", () => api<Detail>(`/alerts/${id}/status`, { method: "POST", json: { status: "closed", note } }))}>Close alert</Button>}
                  </div>
                </>
              ) : <p className="text-sm text-muted">Only the assigned officer or an administrator can update this alert.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Audit history" icon={History} action={<button onClick={reload} className="text-xs font-medium text-teal-700">Refresh</button>} />
            <ol className="max-h-[480px] space-y-3 overflow-y-auto p-5">
              {a.history.map((h, i) => (
                <li key={i} className="border-l-2 border-navy-100 pl-3 text-[13px]">
                  <p className="font-medium text-navy-900">{h.action.replace(/_/g, " ")}{h.changes && "status" in h.changes ? `: ${labelOf(vocab, "alert_status", (h.changes.status as { to: string }).to)}` : ""}</p>
                  <p className="text-xs text-muted">{h.actor} · {fmtDateTime(h.at)}</p>
                  {h.reason && <p className="mt-0.5 text-xs italic text-navy-800">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
