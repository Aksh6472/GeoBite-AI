"use client";

import clsx from "clsx";
import { AlertTriangle, FlaskConical, Inbox, Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

export const cx = clsx;

/* --------------------------------------------------------------- buttons */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "teal";
const btnBase = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-700 shadow-sm",
  teal: "bg-teal-600 text-white hover:bg-teal-700 shadow-sm",
  secondary: "bg-white text-navy-800 border border-line hover:bg-navy-50",
  ghost: "text-navy-700 hover:bg-navy-50",
  danger: "bg-alert-red text-white hover:brightness-95",
};
const btnSizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" };

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  return (
    <button className={cx(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={disabled || loading} {...p}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
export function LinkButton({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: BtnVariant; size?: keyof typeof btnSizes; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}>{children}</Link>;
}

/* --------------------------------------------------------------- surfaces */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-[14px] border border-line bg-white shadow-[var(--shadow-card)]", className)} {...p}>{children}</div>;
}
export function CardHeader({ title, subtitle, action, icon: Icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700"><Icon className="size-4" /></span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900 md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const statTones = {
  navy: "bg-navy-50 text-navy-700",
  teal: "bg-teal-50 text-teal-700",
  sage: "bg-sage-50 text-sage-600",
  orange: "bg-orange-50 text-alert-orange",
  red: "bg-red-50 text-alert-red",
};
export function Stat({ label, value, hint, icon: Icon, tone = "navy", loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ElementType; tone?: keyof typeof statTones; loading?: boolean }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon && <span className={cx("grid size-8 place-items-center rounded-lg", statTones[tone])}><Icon className="size-4" /></span>}
      </div>
      {loading ? <div className="mt-3 h-8 w-24 animate-pulse rounded bg-navy-50" /> : <p className="mt-2 font-mono text-[26px] font-semibold tracking-tight text-navy-900 tabular-nums">{value}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/* --------------------------------------------------------------- badges */
const badgeTones: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  navy: "bg-navy-50 text-navy-700 ring-navy-100",
  teal: "bg-teal-50 text-teal-700 ring-teal-100",
  green: "bg-sage-50 text-sage-600 ring-sage-100",
  yellow: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};
export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof badgeTones | string; children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", badgeTones[tone] ?? badgeTones.gray, className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, string> = {
  received: "gray", under_verification: "yellow", verified: "green", rejected: "red",
  new: "orange", under_review: "yellow", field_verification_required: "yellow", intervention_assigned: "teal", action_completed: "green", closed: "gray",
  high: "red", medium: "orange", low: "yellow", elevated: "orange", moderate: "yellow",
  planned: "gray", in_progress: "teal", completed: "green", cancelled: "gray",
};

/* --------------------------------------------------------------- form controls */
export function Field({ label, htmlFor, hint, error, required, children, className }: { label: string; htmlFor?: string; hint?: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-navy-900">
        {label}
        {required && <span className="ml-0.5 text-alert-red" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-alert-red" role="alert">{error}</p>}
    </div>
  );
}
const ctl = "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink placeholder:text-slate-500 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-slate-50 aria-[invalid=true]:border-alert-red";
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(ctl, "h-10", className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(ctl, "min-h-[88px] py-2", className)} {...p} />;
});
export function Select({ options, placeholder, className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string | number; label: string }[]; placeholder?: string }) {
  return (
    <select className={cx(ctl, "h-10 pr-8", className)} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* --------------------------------------------------------------- states */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-navy-50", className)} />;
}
export function ErrorBanner({ error, onRetry }: { error: { message: string } | string | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{typeof error === "string" ? error : error.message}</div>
      {onRetry && <button onClick={onRetry} className="font-medium underline">Retry</button>}
    </div>
  );
}
export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-navy-50 text-navy-500"><Icon className="size-5" /></span>
      <p className="mt-3 text-sm font-semibold text-navy-900">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}
export function SyntheticNotice({ compact }: { compact?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900", compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-2.5 text-[13px]")}>
      <FlaskConical className="size-4 shrink-0" />
      <span><strong className="font-semibold">Synthetic demonstration data.</strong>{!compact && " All records shown are generated for research demonstration and do not describe real patients or locations."}</span>
    </div>
  );
}

export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-xs font-medium text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
      {items.map((i) => (
        <button key={i.value} onClick={() => onChange(i.value)} className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium transition", value === i.value ? "bg-navy-800 text-white" : "text-navy-700 hover:bg-navy-50")}>
          {i.label}
          {i.count !== undefined && <span className={cx("ml-1.5 font-mono text-[11px]", value === i.value ? "text-navy-100" : "text-muted")}>{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
