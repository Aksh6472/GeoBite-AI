"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/lib/format";

export const CHART = { navy: "#1b365c", teal: "#1a9a8a", sage: "#5b8a68", sky: "#7f9dc6", orange: "#d9701c", red: "#c0392b", grid: "#e2e7ee", axis: "#5a6b80" };
const tooltipStyle = { borderRadius: 10, border: "1px solid #e2e7ee", fontSize: 12, boxShadow: "0 4px 16px rgb(14 31 56 / .08)" };
const axis = { tick: { fill: CHART.axis, fontSize: 11 }, axisLine: false, tickLine: false } as const;

export function TrendChart({ data, series, height = 260 }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string; type?: "bar" | "line" | "area" }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => monthLabel(String(l))} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) =>
            s.type === "line" ? <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            : s.type === "area" ? <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} />
            : <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />,
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleArea({ data, dataKey, color = CHART.teal, height = 160 }: { data: Record<string, number | string>[]; dataKey: string; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => monthLabel(String(l))} />
          <Area dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bar list: readable labels, exact values, no chart junk. */
export function BarList({ items, color = CHART.navy, max, empty = "No data for this selection" }: { items: { name: string; count: number; sub?: string }[]; color?: string; max?: number; empty?: string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.count));
  if (!items.length || items.every((i) => !i.count)) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.name + (i.sub ?? "")}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink">{i.name}{i.sub && <span className="ml-1.5 text-xs text-muted">{i.sub}</span>}</span>
            <span className="font-mono tabular-nums text-navy-900">{i.count.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full" style={{ width: `${Math.max(2, (i.count / m) * 100)}%`, background: color }} />
        </li>
      ))}
    </ul>
  );
}

export function VBar({ data, xKey, bars, height = 240 }: { data: Record<string, number | string>[]; xKey: string; bars: { key: string; label: string; color: string }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} {...axis} interval={0} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#eef3f9" }} />
          {bars.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic composed chart with any x key (hours, ISO weeks, ...). */
export function XYChart({ data, xKey, series, height = 240, xFormat, yFormat, stacked }: {
  data: Record<string, number | string>[]; xKey: string; series: { key: string; label: string; color: string; type?: "bar" | "line" | "area"; dashed?: boolean }[];
  height?: number; xFormat?: (v: string) => string; yFormat?: (v: number) => string; stacked?: boolean;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} {...axis} minTickGap={12} />
          <YAxis allowDecimals={false} tickFormatter={yFormat} {...axis} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => (xFormat ? xFormat(String(l)) : String(l))} formatter={(v) => (yFormat && typeof v === "number" ? yFormat(v) : v)} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) =>
            s.type === "line" ? <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} />
            : s.type === "area" ? <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.14} strokeWidth={2} stackId={stacked ? "a" : undefined} />
            : <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={stacked ? 0 : [4, 4, 0, 0]} maxBarSize={28} stackId={stacked ? "a" : undefined} />,
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const weekLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
