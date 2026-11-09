"use client";

import { CheckCircle2, ClipboardList, FilePlus2, Map } from "lucide-react";
import { useEffect, useState } from "react";
import { BiteForm } from "@/components/BiteForm";
import { Button, Card, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

type Created = { id: number; incident_code: string; created_at: string; ward_name: string | null; district_name: string; hospital_name: string };

export default function NewIncident() {
  const { user } = useAuth();
  const [created, setCreated] = useState<Created | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [hospitals, setHospitals] = useState<{ id: number; name: string; district: string }[]>([]);
  const [hospitalId, setHospitalId] = useState("");
  const isAdmin = user?.role !== "hospital_staff";
  useEffect(() => { if (isAdmin) api<{ id: number; name: string; district: string }[]>("/meta/hospitals").then(setHospitals).catch(() => {}); }, [isAdmin]);

  if (created) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-sage-500" strokeWidth={1.6} />
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">Incident recorded</h1>
          <p className="mt-1 text-sm text-muted">Saved to the central GeoBite-AI database at {fmtDateTime(created.created_at)}.</p>
          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-line bg-canvas p-4">
            <p className="text-xs text-muted">Incident ID</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-navy-900">{created.incident_code}</p>
            <p className="mt-2 text-[13px] text-muted">{created.ward_name ?? "Ward not assigned"} · {created.district_name}</p>
          </div>
          <p className="mx-auto mt-5 max-w-md text-[13px] text-muted">The hospital dashboard and the GIS bite-incident layer now include this record. Ward alert rules were re-evaluated automatically.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <LinkButton href={`/hospital/incidents/${created.id}`} variant="secondary"><ClipboardList className="size-4" />View record</LinkButton>
            <LinkButton href="/hospital/map" variant="secondary"><Map className="size-4" />See on map</LinkButton>
            <Button onClick={() => { setCreated(null); setFormKey((k) => k + 1); window.scrollTo({ top: 0 }); }}><FilePlus2 className="size-4" />Report another</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="New bite incident" subtitle={user?.hospital_name ? `Reporting facility: ${user.hospital_name}` : "Record a suspected dog-bite case presenting at a facility."} />
      <div className="mx-auto max-w-5xl">
        <BiteForm
          key={formKey}
          submitLabel="Submit incident"
          hospitalSelect={isAdmin ? (
            <Field label="Reporting hospital / PHC" htmlFor="hospital_id" required className="md:col-span-3">
              <Select id="hospital_id" placeholder="Select facility" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} options={hospitals.map((h) => ({ value: h.id, label: `${h.name} · ${h.district}` }))} />
            </Field>
          ) : undefined}
          onSubmit={async (body) => {
            const r = await api<Created>("/bite-incidents", { method: "POST", json: { ...body, hospital_id: isAdmin ? Number(hospitalId) || null : null } });
            setCreated(r);
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    </>
  );
}
