"use client";

import { ChevronLeft, ChevronRight, Download, FilePlus2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FilterBar, type Filters } from "@/components/FilterBar";
import { Badge, Button, Card, Empty, ErrorBanner, Input, LinkButton, PageHeader, Select, Skeleton, STATUS_TONE, Table } from "@/components/ui";
import { downloadUrl } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { labelOf, useApi, useVocab } from "@/lib/hooks";

type Row = { id: number; incident_code: string; incident_date: string; hospital_name: string; district_name: string; ward_name: string | null; ward_number: number | null; location_type: string; victim_age_group: string; injury_category: string; pep_status: string; follow_up_status: string; follow_up_due_date: string | null; is_synthetic: boolean; version: number };
const PAGE = 25;
const CAT_TONE: Record<string, string> = { cat_iii: "red", cat_ii: "orange", cat_i: "yellow", not_assessed: "gray" };

function Register() {
  const sp = useSearchParams();
  const router = useRouter();
  const vocab = useVocab();
  const [filters, setFilters] = useState<Filters>({});
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const followUp = sp.get("follow_up") ?? "";
  const params = { ...filters, q: search, follow_up: followUp, limit: PAGE, offset: page * PAGE };
  const { data, error, loading, reload } = useApi<{ total: number; items: Row[] }>("/bite-incidents", params);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <>
      <PageHeader
        title="Incident register"
        subtitle="All bite incidents reported by your facility. Select a record to view, correct it (with audit trail) or see its history."
        actions={<><a href={downloadUrl("/bite-incidents/export.csv", { ...filters, follow_up: followUp })} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy-800 hover:bg-navy-50"><Download className="size-4" />Export CSV</a><LinkButton href="/hospital/report"><FilePlus2 className="size-4" />New incident</LinkButton></>}
      />
      <FilterBar value={filters} onChange={(f) => { setFilters(f); setPage(0); }} show={["geo", "dates"]} />
      <Card className="mt-4">
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(0); }}>
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search incident ID or location" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Follow-up" className="w-full sm:w-52" placeholder="Any follow-up status" value={followUp} options={vocab?.follow_up ?? []} onChange={(e) => router.replace(e.target.value ? `?follow_up=${e.target.value}` : "?")} />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <ErrorBanner error={error} onRetry={reload} />
        {loading && !data ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div> : data && data.items.length === 0 ? (
          <Empty title="No incidents match these filters">Adjust the filters, or record a new incident.</Empty>
        ) : (
          <Table head={["Incident ID", "Date", "Ward", "Setting", "Age", "Category", "PEP", "Follow-up", "Facility"]}>
            {data?.items.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-canvas/70" onClick={() => router.push(`/hospital/incidents/${r.id}`)}>
                <td className="px-4 py-2.5"><Link href={`/hospital/incidents/${r.id}`} className="font-mono text-[12.5px] font-medium text-navy-800 hover:underline">{r.incident_code}</Link>{r.version > 1 && <span className="ml-1.5 text-[11px] text-muted">v{r.version}</span>}</td>
                <td className="whitespace-nowrap px-4 py-2.5">{fmtDate(r.incident_date)}</td>
                <td className="px-4 py-2.5">{r.ward_name ?? "-"}<span className="block text-[11.5px] text-muted">{r.district_name}</span></td>
                <td className="px-4 py-2.5">{labelOf(vocab, "location_types", r.location_type)}</td>
                <td className="px-4 py-2.5 font-mono">{r.victim_age_group}</td>
                <td className="px-4 py-2.5"><Badge tone={CAT_TONE[r.injury_category]}>{labelOf(vocab, "injury_category", r.injury_category)}</Badge></td>
                <td className="px-4 py-2.5">{labelOf(vocab, "pep_status", r.pep_status)}</td>
                <td className="px-4 py-2.5"><Badge tone={r.follow_up_status === "completed" ? "green" : r.follow_up_status === "lost" ? "red" : STATUS_TONE[r.follow_up_status] ?? "yellow"}>{labelOf(vocab, "follow_up", r.follow_up_status)}</Badge>{r.follow_up_due_date && <span className="block text-[11px] text-muted">due {fmtDate(r.follow_up_due_date)}</span>}</td>
                <td className="max-w-[200px] truncate px-4 py-2.5 text-muted">{r.hospital_name}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
            <span>{data.total.toLocaleString("en-IN")} incidents · page {page + 1} of {pages}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
              <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export default function Page() {
  return <Suspense><Register /></Suspense>;
}
