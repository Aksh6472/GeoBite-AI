"use client";

import { ArrowLeft, Building2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/AppShell";
import { Button, cx, ErrorBanner, Field, Input, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { homeFor, useAuth, type User } from "@/lib/auth";

type Hosp = { id: number; name: string; district: string };

export default function RegisterPage() {
  const [type, setType] = useState<"hospital_staff" | "community_reporter">("hospital_staff");
  const [hospitals, setHospitals] = useState<Hosp[]>([]);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", designation: "", hospital_id: "", facility_code: "" });
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const router = useRouter();
  useEffect(() => { api<Hosp[]>("/meta/hospitals").then(setHospitals).catch(() => {}); }, []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { ...form, account_type: type, hospital_id: form.hospital_id ? Number(form.hospital_id) : null, designation: form.designation || null, facility_code: form.facility_code || null };
      const r = await api<{ user: User }>("/auth/register", { method: "POST", json: body });
      setUser(r.user);
      router.replace(homeFor(r.user.role));
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const fe = (f: string) => err?.fields[f];

  return (
    <div className="min-h-[100dvh] px-5 py-10">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between"><Logo /><Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-800"><ArrowLeft className="size-4" />Sign in</Link></div>
        <h1 className="mt-10 text-2xl font-semibold tracking-tight text-navy-900">Create an account</h1>
        <p className="mt-1 text-sm text-muted">Veterinary, municipal and administrator accounts are issued by the GeoBite-AI super administrator.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {([["hospital_staff", "Hospital reporting staff", Building2], ["community_reporter", "Community reporter", Users]] as const).map(([v, l, I]) => (
            <button key={v} type="button" onClick={() => setType(v)} className={cx("flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium transition", type === v ? "border-navy-700 bg-navy-50 text-navy-900 ring-1 ring-navy-700" : "border-line bg-white text-navy-700 hover:border-navy-300")}>
              <I className="size-5 shrink-0" />{l}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-[14px] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
          {err && !Object.keys(err.fields).length && <ErrorBanner error={err} />}
          <Field label="Full name" htmlFor="n" required error={fe("full_name")}><Input id="n" value={form.full_name} onChange={set("full_name")} required /></Field>
          <Field label="Email" htmlFor="e" required error={fe("email")}><Input id="e" type="email" value={form.email} onChange={set("email")} required autoComplete="email" /></Field>
          <Field label="Password" htmlFor="p" required hint="At least 10 characters, including letters and numbers." error={fe("password")}><Input id="p" type="password" value={form.password} onChange={set("password")} required autoComplete="new-password" /></Field>
          {type === "hospital_staff" && (
            <>
              <Field label="Designation" htmlFor="d"><Input id="d" value={form.designation} onChange={set("designation")} placeholder="e.g. Staff Nurse, ARV clinic" /></Field>
              <Field label="Reporting hospital / PHC" htmlFor="h" required><Select id="h" placeholder="Select facility" value={form.hospital_id} onChange={set("hospital_id")} options={hospitals.map((h) => ({ value: h.id, label: `${h.name} · ${h.district}` }))} required /></Field>
              <Field label="Facility access code" htmlFor="c" required hint="Issued by your medical administrator. Demo codes look like DEMO-CHN-01."><Input id="c" value={form.facility_code} onChange={set("facility_code")} required className="font-mono uppercase" /></Field>
              {err && Object.keys(err.fields).length > 0 && !fe("full_name") && !fe("email") && !fe("password") && <ErrorBanner error={err} />}
            </>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
          <p className="text-xs text-muted">Your contact details are used only for account access and are never shown on public maps or dashboards.</p>
        </form>
      </div>
    </div>
  );
}
