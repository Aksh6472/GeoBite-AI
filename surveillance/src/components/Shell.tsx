"use client";

import { Cctv, FlaskConical, ListChecks, Map as MapIcon, Menu, Satellite, ScanEye, Siren, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { generateDemo } from "@/lib/demo";
import { inWindow } from "@/lib/geo";
import { loadDemo, removeDemo, shouldAutoSeed, useCameras, useSightings } from "@/lib/store";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dog map", icon: MapIcon, exact: true },
  { href: "/bites", label: "Bites & dogs", icon: Siren },
  { href: "/cameras", label: "Live cameras", icon: Cctv },
  { href: "/satellite", label: "Satellite & drone scan", icon: Satellite },
  { href: "/sightings", label: "Sightings log", icon: ListChecks },
];

export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className={cx("grid size-9 place-items-center rounded-xl", light ? "bg-white/10 text-teal-100 ring-1 ring-white/15" : "bg-navy-800 text-teal-100")}><ScanEye className="size-5" strokeWidth={1.8} /></span>
      {!compact && (
        <span className="leading-tight">
          <span className={cx("block text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-navy-900")}>StrayWatch</span>
          <span className={cx("block text-[11px]", light ? "text-navy-200" : "text-muted")}>Street dog monitoring</span>
        </span>
      )}
    </Link>
  );
}

function StatusLine() {
  const cams = useCameras();
  const s = useSightings();
  const today = s.filter((x) => inWindow(x.at, "24h")).length;
  return (
    <p className="hidden items-center gap-2 text-[12.5px] text-muted sm:flex">
      <span className={cx("size-2 rounded-full", cams.length ? "bg-sage-500" : "bg-slate-300")} />
      {cams.length} camera{cams.length === 1 ? "" : "s"} set up · {today} dog sighting{today === 1 ? "" : "s"} in the last 24 h
    </p>
  );
}

export const seedDemo = () => loadDemo(generateDemo());

function DemoBanner() {
  const s = useSightings();
  const cams = useCameras();
  const demo = s.filter((x) => x.demo).length;
  if (!demo) return null;
  const real = s.length - demo;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900 md:px-6">
      <FlaskConical className="size-4 shrink-0" />
      <span className="flex-1"><strong className="font-semibold">Demo data is shown.</strong> {cams.filter((c) => c.demo).length} sample cameras in Chennai and {demo.toLocaleString("en-IN")} sample sightings, so you can see how StrayWatch works. Photos are real street dogs from Wikimedia Commons (<Link href="/credits" prefetch={false} className="underline underline-offset-2">credits</Link>), not taken at these cameras.{real ? ` Your ${real} real sighting${real === 1 ? " is" : "s are"} kept.` : ""}</span>
      <button onClick={seedDemo} className="font-medium underline-offset-2 hover:underline">Refresh demo</button>
      <button onClick={() => removeDemo()} className="rounded-md bg-amber-900 px-2.5 py-1 font-medium text-white hover:bg-amber-800">Remove demo data</button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  // First visit with nothing saved: show a populated example instead of empty pages.
  useEffect(() => { if (shouldAutoSeed()) seedDemo(); }, []);
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const isActive = (n: (typeof NAV)[number]) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));

  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex h-16 items-center justify-between px-5"><Logo light /><button className="lg:hidden" aria-label="Close menu" onClick={() => setDrawer(false)}><X className="size-5" /></button></div>
      <ul className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} onClick={() => setDrawer(false)} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition", isActive(n) ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white")}>
              <n.icon className={cx("size-[18px]", isActive(n) ? "text-teal-100" : "text-navy-300")} strokeWidth={1.8} />{n.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-4 text-[11.5px] leading-relaxed text-navy-300">
        Detection runs on this device. Video and photos are never uploaded; sightings are saved in this browser only.
        <Link href="/credits" prefetch={false} onClick={() => setDrawer(false)} className="mt-2 block text-navy-200 hover:text-white">Photo &amp; data credits</Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-[1100] lg:hidden">
          <div className="absolute inset-0 bg-navy-950/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[900] flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-6">
          <button className="grid size-9 place-items-center rounded-lg text-navy-700 hover:bg-navy-50 lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu className="size-5" /></button>
          <div className="lg:hidden"><Logo compact /></div>
          <StatusLine />
        </header>
        <DemoBanner />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
