import { Activity, ArrowRight, Building2, ClipboardCheck, Dog, HeartPulse, Leaf, LineChart, Lock, MapPinned, ShieldCheck, Stethoscope, Syringe, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/AppShell";
import { LandingMap, LiveNumbers } from "./landing-client";

const flow = [
  { icon: Stethoscope, title: "Hospitals report bites", body: "Authorised staff record each suspected dog-bite case with location, category and PEP status. No patient names or phone numbers are collected." },
  { icon: Users, title: "Residents report dogs", body: "A mobile-friendly form captures dog counts and observed behaviour. Overlapping reports of the same dogs are grouped, never summed." },
  { icon: ClipboardCheck, title: "Officers verify", body: "Veterinary and municipal officers review a prioritised queue and confirm reports in the field before they count as verified." },
  { icon: LineChart, title: "Analysts see the pattern", body: "Kernel density, DBSCAN clusters and Getis-Ord Gi* identify wards where bites, behaviour reports and vaccination gaps coincide." },
  { icon: Syringe, title: "Teams intervene humanely", body: "Alerts are assigned, inspected and closed with an audit record. Actions are vaccination, ABC, veterinary care and waste management." },
];

const objectives = [
  { icon: MapPinned, t: "Locate frequent bite incidents", d: "Ward-level and sub-ward concentration of hospital-reported bites." },
  { icon: Dog, t: "Map free-roaming dog populations", d: "De-duplicated community observations, clearly separated from verified surveys." },
  { icon: Activity, t: "Track repeated concerning behaviour", d: "Independent, repeated reports surface for human review, not automatic labels." },
  { icon: Syringe, t: "Expose vaccination gaps", d: "Coverage shown only where a documented survey supports it." },
  { icon: LineChart, t: "Detect emerging hotspots", d: "Statistically tested clusters with transparent, explainable scoring." },
  { icon: ClipboardCheck, t: "Prioritise coordinated action", d: "Medical, veterinary and municipal teams work from one alert record." },
];

export default function Landing() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-50 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-6 text-sm text-navy-700 md:flex">
            <a href="#platform" className="hover:text-navy-900">Platform</a>
            <a href="#portals" className="hover:text-navy-900">Portals</a>
            <a href="#one-health" className="hover:text-navy-900">One Health</a>
            <a href="#ethics" className="hover:text-navy-900">Data ethics</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/community" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-teal-700 hover:bg-teal-50 sm:inline-flex">Community portal</Link>
            <Link href="/login" className="inline-flex h-9 items-center rounded-lg bg-navy-800 px-4 text-sm font-medium text-white hover:bg-navy-700">Sign in</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-navy-50/70 to-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-12 md:px-6 lg:grid-cols-[1fr_1.1fr] lg:pb-20 lg:pt-16">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-teal-700">One Health research platform, Tamil Nadu pilot</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tighter text-navy-900 md:text-6xl">GeoBite-AI</h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-navy-700">An Integrated Geospatial Intelligence Platform for Dog-Bite Surveillance, Stray Dog Population Mapping and One Health Prevention.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?next=/console" className="inline-flex h-12 items-center gap-2 rounded-lg bg-navy-800 px-5 text-[15px] font-medium text-white shadow-sm transition hover:bg-navy-700 active:translate-y-px">Open live dashboard<ArrowRight className="size-4" /></Link>
              <Link href="/community/report" className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-white px-5 text-[15px] font-medium text-navy-800 transition hover:bg-navy-50 active:translate-y-px"><Dog className="size-4" />Report dogs</Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_20px_60px_rgb(14_31_56/0.10)]">
            <LandingMap />
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
              <span>Live public layer: community dog observations, aggregated to a 500 m grid</span>
              <span className="hidden items-center gap-1.5 sm:flex"><span className="size-2.5 rounded-full border border-teal-700 bg-teal-500/60" />dog groups</span>
            </div>
          </div>
        </div>
      </section>

      <LiveNumbers />

      {/* How it works */}
      <section id="platform" className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-3xl font-semibold tracking-tight text-navy-900 md:text-4xl">Two reporting streams, one evidence base.</h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">Human bite surveillance and community observation of dogs usually sit in different departments. GeoBite-AI joins them in one PostGIS database, so each submission appears in every view its audience is authorised to see.</p>
            <div className="mt-8 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
              <div className="bg-white p-4"><p className="font-mono text-2xl font-semibold text-navy-900">3</p><p className="text-muted">connected portals</p></div>
              <div className="bg-white p-4"><p className="font-mono text-2xl font-semibold text-navy-900">5</p><p className="text-muted">GIS map layers</p></div>
              <div className="bg-white p-4"><p className="font-mono text-2xl font-semibold text-navy-900">6</p><p className="text-muted">access roles</p></div>
              <div className="bg-white p-4"><p className="font-mono text-2xl font-semibold text-navy-900">7</p><p className="text-muted">audited alert stages</p></div>
            </div>
          </div>
          <ol className="relative space-y-8 border-l border-line pl-8">
            {flow.map((f) => (
              <li key={f.title} className="relative">
                <span className="absolute -left-[49px] grid size-8 place-items-center rounded-full border border-line bg-white text-navy-700 shadow-sm"><f.icon className="size-4" /></span>
                <h3 className="text-[17px] font-semibold text-navy-900">{f.title}</h3>
                <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Portals */}
      <section id="portals" className="bg-canvas py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-navy-900 md:text-4xl">A portal for every responsibility.</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:grid-rows-2">
            <Link href="/login?next=/console" className="group relative overflow-hidden rounded-[18px] bg-navy-900 p-7 text-white lg:row-span-2 lg:p-9">
              <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "radial-gradient(circle at 70% 30%, #1a9a8a 0, transparent 40%), radial-gradient(circle at 20% 80%, #34598c 0, transparent 45%)" }} />
              <div className="relative flex h-full flex-col">
                <span className="grid size-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15"><ShieldCheck className="size-5 text-teal-100" /></span>
                <h3 className="mt-6 text-2xl font-semibold tracking-tight">Veterinary and administration console</h3>
                <p className="mt-3 max-w-[48ch] text-navy-200">Integrated indicators, the five-layer GIS map, the verification queue, hotspot analysis, risk modelling and the complete alert and intervention workflow.</p>
                <ul className="mt-6 grid gap-2 text-sm text-navy-100 sm:grid-cols-2">
                  {["Super and medical administrators", "Veterinary officers", "Municipal officers", "District-scoped access"].map((x) => <li key={x} className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-teal-100" />{x}</li>)}
                </ul>
                <span className="mt-auto inline-flex items-center gap-2 pt-10 text-sm font-medium text-teal-100">Sign in to the console<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
            <Link href="/login?next=/hospital" className="group rounded-[18px] border border-line bg-white p-7 transition hover:border-navy-300">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700"><Building2 className="size-5" /></span>
                <div>
                  <h3 className="text-xl font-semibold text-navy-900">Hospital reporting</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">Doctors, nurses and records staff log bite incidents, track PEP follow-up and correct records with a full audit trail.</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-800">Hospital sign-in<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
                </div>
              </div>
            </Link>
            <Link href="/community" className="group rounded-[18px] bg-teal-700 p-7 text-white transition hover:bg-teal-600">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Users className="size-5" /></span>
                <div>
                  <h3 className="text-xl font-semibold">Community reporting</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-teal-50">Residents report dogs and behaviour in their locality without an account, then track the status of each report.</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">Open community portal<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-navy-900 md:text-4xl">Project objectives</h2>
        <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {objectives.map((o) => (
            <div key={o.t} className="flex gap-4">
              <o.icon className="mt-0.5 size-5 shrink-0 text-teal-600" strokeWidth={1.8} />
              <div>
                <h3 className="font-semibold text-navy-900">{o.t}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{o.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* One Health */}
      <section id="one-health" className="bg-navy-900 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-teal-100">The One Health approach</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">Rabies is prevented where human, animal and environmental health meet.</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[18px] bg-white/10 md:grid-cols-3">
            {[
              { i: HeartPulse, t: "Human health", d: "Timely bite reporting, wound care and complete post-exposure prophylaxis, tracked by the treating facility." },
              { i: Dog, t: "Animal health", d: "Mass dog vaccination, Animal Birth Control and veterinary care, targeted where evidence shows need." },
              { i: Leaf, t: "Environment", d: "Waste management and responsible feeding points reduce the conditions that concentrate free-roaming dogs." },
            ].map((c) => (
              <div key={c.t} className="bg-navy-900 p-7">
                <c.i className="size-6 text-teal-100" strokeWidth={1.6} />
                <h3 className="mt-4 text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-navy-200">{c.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-[14.5px] leading-relaxed text-navy-200">GeoBite-AI never recommends removal, poisoning or harm. A high observed dog population is treated as a signal for vaccination and ABC outreach, not as a measure of danger.</p>
        </div>
      </section>

      {/* Ethics */}
      <section id="ethics" className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-navy-900 md:text-4xl">Built for institutional trust.</h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">The prototype runs on synthetic data. Real hospital data will be integrated only after institutional ethics approval and formal data-sharing agreements.</p>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {[
              { i: Lock, t: "Data minimisation", d: "No patient names, phone numbers or addresses are collected in bite reports." },
              { i: MapPinned, t: "Location privacy", d: "Public layers are aggregated to a 500 m grid and small counts are suppressed." },
              { i: ShieldCheck, t: "Role-based access", d: "Six roles, district scoping and an audit log of every edit and status change." },
              { i: Stethoscope, t: "Clinical judgement first", d: "No AI diagnosis or treatment advice. Models prioritise review; people decide." },
            ].map((x) => (
              <div key={x.t}>
                <dt className="flex items-center gap-2 font-semibold text-navy-900"><x.i className="size-4 text-teal-600" />{x.t}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{x.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-6">
          <Logo />
          <p className="max-w-xl">Research prototype for demonstration. All data displayed is synthetic. Map data © OpenStreetMap contributors.</p>
          <div className="flex gap-4"><Link href="/community/track" className="hover:text-navy-800">Track a report</Link><Link href="/register" className="hover:text-navy-800">Register</Link></div>
        </div>
      </footer>
    </div>
  );
}
