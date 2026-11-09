"use client";

import { Check, SearchCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Button, Card, cx, ErrorBanner, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

type Status = { report_code: string; status: string; status_label: string; submitted_at: string; observed_at: string; updated_at: string; district: string; ward: string | null; locality: string | null; dogs_reported: number | null; behaviours: string[]; verified_at: string | null };
const STEPS = [
  { key: "received", label: "Received" },
  { key: "under_verification", label: "Under verification" },
  { key: "verified", label: "Verified" },
];

function Tracker() {
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get("code") ?? "");
  const [data, setData] = useState<Status | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (c: string) => {
    if (!c.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setData(await api<Status>(`/community/reports/status/${encodeURIComponent(c.trim().toUpperCase())}`));
    } catch (e) {
      setData(null);
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const c = sp.get("code");
    if (!c) return;
    api<Status>(`/community/reports/status/${encodeURIComponent(c.trim().toUpperCase())}`).then(setData).catch((e) => setErr(e as ApiError));
  }, [sp]);

  const idx = data ? (data.status === "rejected" ? -1 : STEPS.findIndex((s) => s.key === data.status)) : -1;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900 md:text-3xl">Track your report</h1>
      <p className="mt-1 text-sm text-muted">Enter the report ID you received after submitting, for example GB-CR-7KQ4M2XP.</p>
      <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="mt-5 flex gap-2">
        <Input aria-label="Report ID" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 font-mono uppercase" placeholder="GB-CR-XXXXXXXX" />
        <Button type="submit" size="lg" variant="teal" loading={busy}><SearchCheck className="size-4" />Check</Button>
      </form>
      <div className="mt-4"><ErrorBanner error={err} /></div>
      {data && (
        <Card className="mt-5 p-6">
          <p className="font-mono text-lg font-semibold text-navy-900">{data.report_code}</p>
          <p className="text-[13px] text-muted">Submitted {fmtDateTime(data.submitted_at)} · {data.ward ? `${data.ward}, ` : ""}{data.district}</p>
          {data.status === "rejected" ? (
            <p className="mt-5 rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-700">This report was reviewed and could not be verified. Thank you for reporting; officers may have found the situation resolved or the location unclear.</p>
          ) : (
            <ol className="mt-6 grid grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className="relative flex flex-col items-center text-center">
                  {i > 0 && <span className={cx("absolute right-1/2 top-4 h-0.5 w-full", i <= idx ? "bg-teal-600" : "bg-line")} />}
                  <span className={cx("relative grid size-8 place-items-center rounded-full border-2 text-xs font-semibold", i <= idx ? "border-teal-600 bg-teal-600 text-white" : "border-line bg-white text-muted")}>{i <= idx ? <Check className="size-4" /> : i + 1}</span>
                  <span className={cx("mt-2 text-[12.5px] font-medium", i <= idx ? "text-navy-900" : "text-muted")}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
            <div><dt className="text-muted">Observed</dt><dd>{fmtDateTime(data.observed_at)}</dd></div>
            <div><dt className="text-muted">Dogs reported</dt><dd>{data.dogs_reported ?? "-"}</dd></div>
            <div className="col-span-2"><dt className="text-muted">Behaviour reported</dt><dd>{data.behaviours.length ? data.behaviours.join(", ") : "None selected"}</dd></div>
            <div className="col-span-2"><dt className="text-muted">Last updated</dt><dd>{fmtDateTime(data.updated_at)}</dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Tracker /></Suspense>;
}
