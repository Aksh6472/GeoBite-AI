"use client";

import { ArrowLeft, History, PencilLine } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BiteForm, type BiteValues } from "@/components/BiteForm";
import { Badge, Button, Card, CardHeader, ErrorBanner, Field, PageHeader, Skeleton, SyntheticNotice, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { labelOf, useApi, useVocab } from "@/lib/hooks";

type Incident = BiteValues & { id: number; incident_code: string; version: number; hospital_name: string; reported_by_name: string | null; district_name: string; municipality_name: string | null; ward_name: string | null; is_synthetic: boolean; created_at: string; updated_at: string };
type Hist = { id: number; action: string; actor: string; role: string; changes: Record<string, { from: unknown; to: unknown }> | null; reason: string | null; at: string };

const EDITABLE = ["incident_date", "incident_time_approx", "hospital_report_date", "district_id", "municipality_id", "ward_id", "location_description", "latitude", "longitude", "location_type", "persons_affected", "victim_age_group", "victim_sex", "circumstances", "dog_ownership", "provocation", "injury_category", "body_part", "clinical_assessment_status", "wound_management_status", "pep_status", "rig_status", "follow_up_status", "follow_up_due_date", "clinical_notes"];

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-[160px_1fr] gap-3 py-2 text-[13.5px]"><dt className="text-muted">{k}</dt><dd className="text-ink">{v || "-"}</dd></div>;
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const vocab = useVocab();
  const inc = useApi<Incident>(`/bite-incidents/${id}`);
  const hist = useApi<Hist[]>(`/bite-incidents/${id}/history`);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const d = inc.data;
  const L = (g: string, k: string) => labelOf(vocab, g, d?.[k] as string);

  return (
    <>
      <Link href="/hospital/incidents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-800"><ArrowLeft className="size-4" />Incident register</Link>
      <ErrorBanner error={inc.error} />
      {!d ? <Skeleton className="h-96" /> : (
        <>
          <PageHeader
            title={d.incident_code}
            subtitle={<>Reported by {d.hospital_name}{d.reported_by_name ? `, ${d.reported_by_name}` : ""} · version {d.version} · last updated {fmtDateTime(d.updated_at)}</>}
            actions={!editing && <Button variant="secondary" onClick={() => setEditing(true)}><PencilLine className="size-4" />Correct record</Button>}
          />
          {d.is_synthetic && <div className="mb-5"><SyntheticNotice compact /></div>}
          {editing ? (
            <div className="mx-auto max-w-5xl">
              <BiteForm
                initial={Object.fromEntries(EDITABLE.map((k) => [k, d[k] ?? ""]))}
                submitLabel="Save correction"
                extra={
                  <Card className="p-5">
                    <Field label="Reason for correction" htmlFor="reason" required hint="Recorded in the audit trail with your name and the changed fields." error={reasonErr ?? undefined}>
                      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                    </Field>
                    <Button type="button" variant="ghost" className="mt-3" onClick={() => setEditing(false)}>Cancel</Button>
                  </Card>
                }
                onSubmit={async (body) => {
                  if (reason.trim().length < 5) { setReasonErr("Please describe the correction (at least 5 characters)"); throw new Error("A reason for the correction is required."); }
                  setReasonErr(null);
                  const r = await api<Incident>(`/bite-incidents/${id}`, { method: "PUT", json: { ...body, edit_reason: reason, expected_version: d.version } });
                  inc.setData(r);
                  setEditing(false);
                  setReason("");
                  hist.reload();
                }}
              />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="space-y-6">
                <Card><CardHeader title="Incident details" /><dl className="divide-y divide-line px-5">
                  <Row k="Date of incident" v={`${fmtDate(d.incident_date as string)} · ${L("time_approx", "incident_time_approx")}`} />
                  <Row k="Reported at hospital" v={fmtDate(d.hospital_report_date as string)} />
                  <Row k="Location" v={<>{d.ward_name ?? "Ward not assigned"}, {d.municipality_name}, {d.district_name}<span className="block text-xs text-muted">{d.location_description} · {Number(d.latitude).toFixed(5)}, {Number(d.longitude).toFixed(5)}</span></>} />
                  <Row k="Location type" v={L("location_types", "location_type")} />
                </dl></Card>
                <Card><CardHeader title="Bite incident details" /><dl className="divide-y divide-line px-5">
                  <Row k="People affected" v={String(d.persons_affected)} />
                  <Row k="Age group / sex" v={`${L("age_groups", "victim_age_group")} · ${L("sex", "victim_sex")}`} />
                  <Row k="Dog" v={`${L("dog_ownership", "dog_ownership")} · ${L("provocation", "provocation")}`} />
                  <Row k="Injury category" v={<Badge tone={d.injury_category === "cat_iii" ? "red" : "orange"}>{L("injury_category", "injury_category")}</Badge>} />
                  <Row k="Body part" v={L("body_part", "body_part")} />
                  <Row k="Circumstances" v={d.circumstances as string} />
                </dl></Card>
                <Card><CardHeader title="Clinical information" subtitle="Reporting status only" /><dl className="divide-y divide-line px-5">
                  <Row k="Clinical assessment" v={L("clinical_assessment", "clinical_assessment_status")} />
                  <Row k="Wound management" v={L("wound_management", "wound_management_status")} />
                  <Row k="Rabies vaccine / PEP" v={L("pep_status", "pep_status")} />
                  <Row k="Immunoglobulin" v={L("rig_status", "rig_status")} />
                  <Row k="Follow-up" v={`${L("follow_up", "follow_up_status")}${d.follow_up_due_date ? ` · due ${fmtDate(d.follow_up_due_date as string)}` : ""}`} />
                  <Row k="Clinical notes" v={d.clinical_notes as string} />
                </dl></Card>
              </div>
              <Card className="self-start">
                <CardHeader title="Audit trail" icon={History} subtitle="Every creation and correction" />
                <ol className="space-y-4 p-5">
                  {hist.data?.map((h) => (
                    <li key={h.id} className="border-l-2 border-navy-100 pl-3">
                      <p className="text-[13px] font-medium text-navy-900">{h.action === "create" ? "Record created" : h.action === "update" ? "Record corrected" : h.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted">{h.actor} · {fmtDateTime(h.at)}</p>
                      {h.reason && <p className="mt-1 text-[12.5px] italic text-navy-800">&ldquo;{h.reason}&rdquo;</p>}
                      {h.action === "update" && h.changes && (
                        <ul className="mt-1.5 space-y-0.5 text-xs">
                          {Object.entries(h.changes).map(([f, c]) => <li key={f}><span className="text-muted">{f.replace(/_/g, " ")}:</span> <span className="line-through decoration-red-400">{String(c.from ?? "empty")}</span> <span className="font-medium text-sage-600">{String(c.to ?? "empty")}</span></li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                  {hist.data && hist.data.length === 0 && <p className="text-sm text-muted">This synthetic record was created by the seed script and has no edits yet.</p>}
                </ol>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
