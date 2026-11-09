"use client";

import { Check, Clock, ImageIcon, Users, X } from "lucide-react";
import { useState } from "react";
import { FilterBar, type Filters } from "@/components/FilterBar";
import { Badge, Button, Card, CardHeader, cx, Empty, ErrorBanner, Field, PageHeader, Skeleton, STATUS_TONE, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { labelOf, useApi, useVocab } from "@/lib/hooks";

type Report = {
  id: number; report_code: string; status: string; observed_at: string; created_at: string; district: string; ward: string | null; ward_number: number | null; locality: string | null; street_landmark: string | null;
  lat: number; lng: number; location_method: string; dogs: { total: number; puppies: number | null; adults: number | null; injured: number | null; ear_notched: number | null; grouping: string | null; estimated_locality: number | null } | null;
  behaviours: { category: string; label: string; description: string | null }[]; has_photo: boolean; priority_score: number; priority_reasons: string[]; cluster_id: number | null;
  is_probable_duplicate: boolean; is_synthetic: boolean; description?: string | null; verified_by: string | null; verified_at: string | null; verification_notes: string | null;
  cluster_members?: Report[];
};

export default function Moderation() {
  const vocab = useVocab();
  const [filters, setFilters] = useState<Filters>({});
  const [status, setStatus] = useState("received");
  const [sort, setSort] = useState<"priority" | "recent">("priority");
  const [sel, setSel] = useState<number | null>(null);
  const counts = useApi<Record<string, number>>("/community/stats/queue");
  const list = useApi<{ total: number; items: Report[] }>("/community/reports", { ...filters, status, sort, limit: 60 });
  const detail = useApi<Report>(sel ? `/community/reports/${sel}` : null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Error | null>(null);

  const act = async (s: "under_verification" | "verified" | "rejected") => {
    if (!sel) return;
    setBusy(s);
    setErr(null);
    try {
      await api(`/community/reports/${sel}/verify`, { method: "POST", json: { status: s, notes: notes || null } });
      setNotes("");
      list.reload();
      counts.reload();
      detail.reload();
    } catch (e) {
      setErr(e as Error);
    } finally {
      setBusy(null);
    }
  };
  const r = detail.data;

  return (
    <>
      <PageHeader title="Verification queue" subtitle="Community reports are observations until reviewed. The queue is ordered by a transparent priority score that only decides what to review first; it never classifies a dog as dangerous." />
      <FilterBar value={filters} onChange={setFilters} show={["geo", "dates", "type"]} />
      <div className="my-4 flex flex-wrap items-center gap-2">
        <Tabs value={status} onChange={(v) => { setStatus(v); setSel(null); }} items={(vocab?.report_status ?? []).map((o) => ({ value: o.value, label: o.label, count: counts.data?.[o.value] ?? 0 }))} />
        <div className="ml-auto"><Tabs value={sort} onChange={setSort} items={[{ value: "priority", label: "Priority" }, { value: "recent", label: "Most recent" }]} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          <ErrorBanner error={list.error} />
          {!list.data ? <div className="space-y-2 p-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div> : list.data.items.length === 0 ? <Empty title="Queue is empty">No reports with this status for the selected filters.</Empty> : (
            <ul className="max-h-[760px] divide-y divide-line overflow-y-auto">
              {list.data.items.map((x) => (
                <li key={x.id}>
                  <button onClick={() => setSel(x.id)} className={cx("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas", sel === x.id && "bg-navy-50")}>
                    <span className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[13px] font-semibold", x.priority_score >= 6 ? "bg-red-50 text-alert-red" : x.priority_score >= 3 ? "bg-orange-50 text-alert-orange" : "bg-slate-100 text-slate-600")} title="Review priority score">{x.priority_score}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[12.5px] font-medium text-navy-900">{x.report_code}</span>{x.is_probable_duplicate && <Badge tone="yellow">probable repeat</Badge>}{x.has_photo && <ImageIcon className="size-3.5 text-muted" />}</div>
                      <p className="truncate text-[13px] text-ink">{x.behaviours.map((b) => b.label).join(", ") || "Dog count only"}</p>
                      <p className="text-xs text-muted">{x.dogs?.total ?? 0} dogs · {x.ward ?? x.locality} · {x.district} · {fmtDateTime(x.observed_at)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start lg:sticky lg:top-20">
          {!sel ? <Empty title="Select a report to review" icon={Users}>Details, photo, priority reasons and other reports of the same dogs appear here.</Empty> : !r ? <div className="p-5"><Skeleton className="h-80" /></div> : (
            <>
              <CardHeader title={r.report_code} subtitle={`${r.ward ?? "-"} (Ward ${r.ward_number ?? "-"}) · ${r.district}`} action={<Badge tone={STATUS_TONE[r.status]}>{labelOf(vocab, "report_status", r.status)}</Badge>} />
              <div className="max-h-[640px] space-y-4 overflow-y-auto p-5 text-[13.5px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image, not optimisable */}
                {r.has_photo && <img src={`/api/community/reports/${r.id}/photo`} alt="Photo submitted with the report" className="max-h-64 w-full rounded-lg border border-line object-cover" />}
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-muted">Observed</dt><dd>{fmtDateTime(r.observed_at)}</dd></div>
                  <div><dt className="text-xs text-muted">Location method</dt><dd className="uppercase">{r.location_method}</dd></div>
                  <div><dt className="text-xs text-muted">Landmark</dt><dd>{r.street_landmark ?? "-"}</dd></div>
                  <div><dt className="text-xs text-muted">Coordinates</dt><dd className="font-mono text-xs">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</dd></div>
                  <div><dt className="text-xs text-muted">Dogs reported</dt><dd className="font-semibold">{r.dogs?.total}</dd></div>
                  <div><dt className="text-xs text-muted">Puppies / adults / injured / ear-notched</dt><dd>{[r.dogs?.puppies, r.dogs?.adults, r.dogs?.injured, r.dogs?.ear_notched].map((v) => v ?? "-").join(" / ")}</dd></div>
                </dl>
                <div>
                  <p className="text-xs font-medium text-muted">Reported behaviour</p>
                  <ul className="mt-1 space-y-1">{r.behaviours.map((b) => <li key={b.category}><span className="font-medium">{b.label}</span>{b.description && <span className="text-muted">: {b.description}</span>}</li>)}{r.behaviours.length === 0 && <li className="text-muted">None selected</li>}</ul>
                </div>
                {r.description && <p className="rounded-lg bg-canvas p-3">{r.description}</p>}
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs font-medium text-navy-900">Why this priority ({r.priority_score})</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">{r.priority_reasons.length ? r.priority_reasons.map((x) => <li key={x}>{x}</li>) : <li>No concern indicators; routine count.</li>}</ul>
                </div>
                {!!r.cluster_members?.length && (
                  <div>
                    <p className="text-xs font-medium text-muted">Other reports of the same observation group ({r.cluster_members.length})</p>
                    <ul className="mt-1 space-y-1 text-xs">{r.cluster_members.slice(0, 8).map((m) => <li key={m.id} className="flex justify-between gap-2"><span className="font-mono">{m.report_code}</span><span className="text-muted">{m.dogs?.total} dogs · {fmtDateTime(m.observed_at)}</span><Badge tone={STATUS_TONE[m.status]}>{m.status.replace(/_/g, " ")}</Badge></li>)}</ul>
                  </div>
                )}
                {r.verified_by && <p className="text-xs text-muted">Reviewed by {r.verified_by} on {fmtDateTime(r.verified_at)}{r.verification_notes ? `: ${r.verification_notes}` : ""}</p>}
                <ErrorBanner error={err} />
                <Field label="Review notes" htmlFor="vn"><Textarea id="vn" className="min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" loading={busy === "under_verification"} onClick={() => act("under_verification")}><Clock className="size-3.5" />Field check</Button>
                  <Button size="sm" variant="teal" loading={busy === "verified"} onClick={() => act("verified")}><Check className="size-3.5" />Verify</Button>
                  <Button size="sm" variant="secondary" loading={busy === "rejected"} onClick={() => act("rejected")}><X className="size-3.5" />Reject</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
