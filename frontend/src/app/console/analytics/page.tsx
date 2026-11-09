"use client";

import { BrainCircuit, Camera, FlaskConical, Play, Sigma } from "lucide-react";
import { useRef, useState } from "react";
import { BarList, CHART } from "@/components/charts";
import { Badge, Button, Card, CardHeader, ErrorBanner, PageHeader, Skeleton, STATUS_TONE, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { ADMIN_ROLES, useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type Run<S, R> = { id: number; analysis_type: string; parameters: Record<string, unknown>; summary: S; results: R; model_version: string; is_simulated: boolean; created_at: string } | null;
type WardIdx = { id: number; ward: string; district: string; index: number; priority: string; contributions: Record<string, number>; gi_z: number | null; gi_class: string; data_gaps: string[]; data_completeness: number; bites: number };
type HotSummary = { bites: number; dbscan_clusters: number; gi_hot_99: number; gi_hot_95: number; gi_hot_90: number; priority_high: number; priority_elevated: number; explanation: Record<string, string> };
type Pred = { ward_id: number; ward: string; predicted_bites: number; interval_p10_p90: [number, number]; predicted_rate_per_10k: number; risk_category: string; uncertainty: string; top_factors: { feature: string; direction: string }[]; data_completeness: number };
type Metric = { mae?: number; rmse?: number; unavailable?: string };
type RiskSummary = { prediction_month: string; metrics: { holdout_months: string[]; train_rows: number; test_rows: number } & Record<string, Metric | string[] | number>; feature_importance: Record<string, number>; feature_labels: Record<string, string>; validated_at: string; disclaimer: string };

const COMP_COLORS: Record<string, string> = { bite_incidence: CHART.navy, concerning_behaviour_reports: CHART.orange, vaccination_gap: CHART.teal, observed_dog_density: CHART.sky };

export default function Analytics() {
  const { user } = useAuth();
  const canRun = !!user && (ADMIN_ROLES.includes(user.role) || user.role === "veterinary_officer");
  const hot = useApi<Run<HotSummary, { wards: WardIdx[]; clusters: { district: string; count: number }[] }>>("/analytics/hotspots/latest");
  const risk = useApi<Run<RiskSummary, Pred[]>>("/analytics/risk-model/latest");
  const vision = useApi<{ available: boolean; message: string }>("/analytics/vision/status");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const go = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(e as Error); } finally { setBusy(null); }
  };
  const h = hot.data;
  const rm = risk.data;

  return (
    <>
      <PageHeader title="Hotspot analysis and AI modules" subtitle="Statistical hotspot detection and a prototype ward-level risk model. Every score shows its inputs; model outputs are labelled as simulated while trained on synthetic data." />
      <ErrorBanner error={err} />
      {msg && <p className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-[13px] text-teal-700">{msg}</p>}

      <Card>
        <CardHeader title="One Health hotspot analysis" icon={Sigma} subtitle="DBSCAN clusters of bites, Getis-Ord Gi* significance on ward counts, and the weighted Investigation Priority Index (last 90 days)"
          action={canRun && <Button size="sm" loading={busy === "hot"} onClick={() => go("hot", async () => { const r = await api<{ alerts_created: string[] }>("/analytics/hotspots/run", { method: "POST" }); setMsg(`Analysis complete. ${r.alerts_created.length ? `New alerts: ${r.alerts_created.join(", ")}` : "No new combined-hotspot alerts."}`); hot.reload(); })}><Play className="size-3.5" />Run analysis</Button>} />
        {hot.loading && !h ? <div className="p-5"><Skeleton className="h-60" /></div> : !h ? <p className="p-5 text-sm text-muted">No analysis has been run yet.{canRun ? " Select Run analysis." : ""}</p> : (
          <>
            <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
              {[["Bites analysed", h.summary.bites], ["DBSCAN clusters", h.summary.dbscan_clusters], ["Gi* hot wards (99%)", h.summary.gi_hot_99], ["Gi* hot wards (95%)", h.summary.gi_hot_95], ["High-priority wards", h.summary.priority_high]].map(([l, v]) => (
                <div key={String(l)} className="bg-white px-5 py-4"><p className="font-mono text-2xl font-semibold text-navy-900">{String(v)}</p><p className="text-xs text-muted">{l}</p></div>
              ))}
            </div>
            <div className="px-5 py-3 text-xs text-muted">Run {fmtDateTime(h.created_at)} · {h.model_version}{h.is_simulated && " · synthetic data"}</div>
            <Table head={["Ward", "Priority index", "Contribution breakdown", "Gi*", "Data completeness"]}>
              {h.results.wards.slice(0, 14).map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-2.5 font-medium">{w.ward}<span className="block text-xs font-normal text-muted">{w.district}</span></td>
                  <td className="px-4 py-2.5"><span className="font-mono text-[15px] font-semibold">{w.index}</span> <Badge tone={STATUS_TONE[w.priority]}>{w.priority}</Badge></td>
                  <td className="min-w-[260px] px-4 py-2.5">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full" title={Object.entries(w.contributions).map(([k, v]) => `${k}: ${v}`).join("\n")}>
                      {Object.entries(w.contributions).map(([k, v]) => <span key={k} style={{ width: `${v}%`, background: COMP_COLORS[k] }} />)}
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{Object.entries(w.contributions).map(([k, v]) => `${k.split("_")[0]} ${v}`).join(" · ")}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className="font-mono">{w.gi_z ?? "-"}</span> <span className="text-xs text-muted">{w.gi_class.replace(/_/g, " ")}</span></td>
                  <td className="px-4 py-2.5">{Math.round(w.data_completeness * 100)}%{w.data_gaps.length > 0 && <span className="block text-[11px] text-alert-orange">{w.data_gaps.join(", ")}</span>}</td>
                </tr>
              ))}
            </Table>
            <div className="grid gap-3 border-t border-line p-5 text-xs text-muted md:grid-cols-2">
              {Object.entries(h.summary.explanation).map(([k, v]) => <p key={k}><span className="mr-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: COMP_COLORS[k] }} /><span className="font-medium text-navy-800">{k.replace(/_/g, " ")}</span>: {v}</p>)}
            </div>
          </>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Predictive ward risk model" icon={BrainCircuit} subtitle="Random Forest (and XGBoost if available) compared with a historical-rate baseline on a temporal hold-out"
          action={canRun && <Button size="sm" loading={busy === "rm"} onClick={() => go("rm", async () => { await api("/analytics/risk-model/train", { method: "POST" }); setMsg("Model retrained and validated on the latest data."); risk.reload(); })}><Play className="size-3.5" />Retrain and validate</Button>} />
        {risk.loading && !rm ? <div className="p-5"><Skeleton className="h-60" /></div> : !rm ? <p className="p-5 text-sm text-muted">No model has been trained yet.</p> : (
          <>
            {rm.is_simulated && <div className="mx-5 mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900"><FlaskConical className="mt-0.5 size-4 shrink-0" /><span><strong>SIMULATED OUTPUT.</strong> {rm.summary.disclaimer} Metrics below describe fit to synthetic data only and must not be cited as real-world accuracy.</span></div>}
            <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-[13px] font-medium text-navy-900">Hold-out validation ({rm.summary.metrics.holdout_months.join(", ")})</p>
                <table className="mt-2 w-full text-[13px]">
                  <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-medium">Model</th><th className="font-medium">MAE (bites/ward/month)</th><th className="font-medium">RMSE</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {[["baseline_historical_rate", "Historical-rate baseline"], ["random_forest", "Random Forest"], ["xgboost", "XGBoost"]].map(([k, l]) => {
                      const m = rm.summary.metrics[k] as Metric | undefined;
                      return <tr key={k}><td className="py-2">{l}</td><td className="font-mono">{m?.mae ?? "n/a"}</td><td className="font-mono">{m?.rmse ?? (m?.unavailable ? "unavailable" : "n/a")}</td></tr>;
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">Model {rm.model_version} · validated {fmtDateTime(rm.summary.validated_at)} · {rm.summary.metrics.train_rows} training / {rm.summary.metrics.test_rows} test ward-months. Lower is better.</p>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-navy-900">Feature importance (Random Forest)</p>
                <BarList items={Object.entries(rm.summary.feature_importance).slice(0, 8).map(([k, v]) => ({ name: rm.summary.feature_labels[k] ?? k, count: Math.round(v * 1000) / 10 }))} color={CHART.teal} />
                <p className="mt-1 text-[11px] text-muted">Percent of total impurity reduction.</p>
              </div>
            </div>
            <Table head={["Ward", `Predicted bites (${rm.summary.prediction_month})`, "80% interval", "Rate per 10k", "Risk category", "Uncertainty", "Main contributing factors", "Data"]}>
              {rm.results.slice(0, 15).map((p) => (
                <tr key={p.ward_id}>
                  <td className="px-4 py-2.5 font-medium">{p.ward}</td>
                  <td className="px-4 py-2.5 font-mono">{p.predicted_bites}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{p.interval_p10_p90[0]} to {p.interval_p10_p90[1]}</td>
                  <td className="px-4 py-2.5 font-mono">{p.predicted_rate_per_10k}</td>
                  <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[p.risk_category]}>{p.risk_category}</Badge></td>
                  <td className="px-4 py-2.5">{p.uncertainty}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{p.top_factors.slice(0, 3).map((f) => `${f.feature} (${f.direction})`).join("; ")}</td>
                  <td className="px-4 py-2.5">{Math.round(p.data_completeness * 100)}%</td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <VisionCard available={!!vision.data?.available} message={vision.data?.message} />
        <Card>
          <CardHeader title="Behavioural observation analysis" icon={BrainCircuit} subtitle="Rule-based prioritisation for human review" />
          <div className="space-y-2 p-5 text-[13.5px] text-muted">
            <p>Each community report is scored when submitted and re-scored as related reports arrive. Points are added for concerning behaviour types, a reported bite, animal-welfare needs, independent repeat reports within 400 m and 14 days, and nearby hospital-reported bites in the last 30 days. Probable repeat submissions by the same reporter are halved.</p>
            <p>The score orders the verification queue only. Aggression or rabies is never inferred from photographs or unverified public reports.</p>
          </div>
        </Card>
      </div>
    </>
  );
}

function VisionCard({ available, message }: { available: boolean; message?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<{ detections: number; caveat: string } | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  return (
    <Card>
      <CardHeader title="Field-survey photo dog detection (YOLO)" icon={Camera} subtitle="Optional computer-vision module" action={<Badge tone={available ? "green" : "gray"}>{available ? "enabled" : "not installed"}</Badge>} />
      <div className="space-y-3 p-5 text-[13.5px]">
        <p className="text-muted">Counts dog detections in a single field-survey photograph using Ultralytics YOLO. It does not identify individual dogs across overlapping photos and is not a population estimate.</p>
        {!available ? <p className="rounded-lg bg-canvas p-3 text-xs text-muted">{message ?? "Module unavailable."} See docs/AI_MODULES.md to enable it.</p> : (
          <>
            <input ref={ref} type="file" accept="image/*" className="block text-sm" />
            <Button size="sm" onClick={async () => { const file = ref.current?.files?.[0]; if (!file) return; const fd = new FormData(); fd.append("photo", file); try { setRes(await api("/analytics/vision/count", { method: "POST", body: fd })); } catch (e) { setErr(e as Error); } }}>Detect dogs</Button>
            {res && <p><strong>{res.detections}</strong> dog detection(s). <span className="text-xs text-muted">{res.caveat}</span></p>}
            <ErrorBanner error={err} />
          </>
        )}
      </div>
    </Card>
  );
}
