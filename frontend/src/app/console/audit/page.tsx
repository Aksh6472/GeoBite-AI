"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ErrorBanner, PageHeader, Select, Skeleton, Table } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type Log = { id: number; at: string; actor: string; role: string; action: string; entity_type: string; entity_id: number | null; changes: Record<string, unknown> | null; reason: string | null };
const ENTITIES = ["bite_incident", "community_report", "alert", "vaccination_record", "user", "hotspot_analysis"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
const PAGE = 50;

export default function Audit() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const { data, error } = useApi<{ total: number; items: Log[] }>("/admin/audit-logs", { entity_type: entity, limit: PAGE, offset: page * PAGE });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every creation, correction, verification, assignment, status change, export and sign-in. Personal identifiers are redacted from recorded changes." />
      <div className="mb-4 w-full sm:w-64"><Select aria-label="Entity" placeholder="All record types" value={entity} options={ENTITIES} onChange={(e) => { setEntity(e.target.value); setPage(0); }} /></div>
      <Card>
        <ErrorBanner error={error} />
        {!data ? <div className="p-4"><Skeleton className="h-96" /></div> : (
          <Table head={["When", "Actor", "Action", "Record", "Changes / reason"]}>
            {data.items.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDateTime(l.at)}</td>
                <td className="px-4 py-2.5">{l.actor}<span className="block text-xs text-muted">{l.role}</span></td>
                <td className="px-4 py-2.5"><Badge tone="navy">{l.action.replace(/_/g, " ")}</Badge></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{l.entity_type.replace(/_/g, " ")}{l.entity_id ? ` #${l.entity_id}` : ""}</td>
                <td className="max-w-[420px] px-4 py-2.5 text-xs"><code className="break-all text-navy-800">{l.changes ? JSON.stringify(l.changes) : ""}</code>{l.reason && <p className="mt-0.5 italic text-muted">{l.reason}</p>}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
            <span>{data.total.toLocaleString("en-IN")} entries</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous"><ChevronLeft className="size-4" /></Button>
              <Button variant="secondary" size="sm" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)} aria-label="Next"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
