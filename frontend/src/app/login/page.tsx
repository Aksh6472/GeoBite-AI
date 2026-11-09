"use client";

import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/AppShell";
import { Button, ErrorBanner, Field, Input, SyntheticNotice } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth";

const DEMO = [
  { label: "Hospital staff (Chennai)", email: "hospital.chennai@geobite.demo" },
  { label: "Medical administrator", email: "medical.admin@geobite.demo" },
  { label: "Super administrator", email: "admin@geobite.demo" },
  { label: "Veterinary officer (Chennai)", email: "vet.chennai@geobite.demo" },
  { label: "Municipal officer (Chennai)", email: "municipal.chennai@geobite.demo" },
  { label: "Community reporter", email: "citizen@geobite.demo" },
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(u.role);
      router.replace(target);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ErrorBanner error={error} />
      <Field label="Email" htmlFor="email" required>
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}><LockKeyhole className="size-4" />Sign in</Button>
      <div className="rounded-xl border border-line bg-canvas p-3">
        <p className="text-xs font-medium text-navy-800">Demonstration accounts (password <span className="font-mono">GeoBite#2026</span>)</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {DEMO.map((d) => (
            <button type="button" key={d.email} onClick={() => { setEmail(d.email); setPassword("GeoBite#2026"); }} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-left text-xs text-navy-800 hover:border-navy-300">
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1fr_520px]">
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="mt-auto max-w-lg">
          <h2 className="text-3xl font-semibold tracking-tight">One surveillance picture for hospitals, veterinarians and municipalities.</h2>
          <p className="mt-4 text-navy-200">Each portal writes to the same geospatial database, so a bite reported at a hospital and a sighting reported by a resident meet on one map.</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-teal-500/10 blur-3xl" />
      </div>
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy-800"><ArrowLeft className="size-4" />Back to home</Link>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Sign in to GeoBite-AI</h1>
          <p className="mt-1 text-sm text-muted">Authorised hospital, veterinary, municipal and administrative users.</p>
          <div className="mt-6"><Suspense><LoginForm /></Suspense></div>
          <p className="mt-6 text-sm text-muted">New hospital staff or community reporter? <Link href="/register" className="font-medium text-teal-700 hover:underline">Create an account</Link></p>
          <div className="mt-6"><SyntheticNotice compact /></div>
        </div>
      </div>
    </div>
  );
}
