"use client";

import { Bell, LogOut, Menu, Radar, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { homeFor, type Role, useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { cx, Skeleton } from "./ui";

export type NavItem = { href: string; label: string; icon: React.ElementType; roles?: Role[]; exact?: boolean };

export function Logo({ compact, light }: { compact?: boolean; light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className={cx("grid size-9 place-items-center rounded-xl", light ? "bg-white/10 text-teal-100 ring-1 ring-white/15" : "bg-navy-800 text-teal-100")}><Radar className="size-5" strokeWidth={1.8} /></span>
      {!compact && (
        <span className="leading-tight">
          <span className={cx("block text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-navy-900")}>GeoBite-AI</span>
          <span className={cx("block text-[11px]", light ? "text-navy-200" : "text-muted")}>One Health geospatial intelligence</span>
        </span>
      )}
    </Link>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ unread: number; items: { id: number; title: string; body: string | null; link: string | null; is_read: boolean; at: string }[] }>("/notifications");
  useEffect(() => {
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);
  const router = useRouter();
  return (
    <div className="relative">
      <button aria-label="Notifications" onClick={() => setOpen(!open)} className="relative grid size-9 place-items-center rounded-lg text-navy-700 hover:bg-navy-50">
        <Bell className="size-[18px]" />
        {!!data?.unread && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-alert-red px-1 font-mono text-[10px] font-semibold text-white">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-[1000] mt-2 w-[min(360px,90vw)] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <button className="text-xs font-medium text-teal-700" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); reload(); }}>Mark all read</button>
          </div>
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto">
            {!data?.items.length && <li className="px-4 py-6 text-center text-sm text-muted">No notifications yet</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button
                  className={cx("w-full px-4 py-3 text-left hover:bg-canvas", !n.is_read && "bg-teal-50/50")}
                  onClick={async () => { await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {}); setOpen(false); reload(); if (n.link) router.push(n.link); }}
                >
                  <p className="text-[13px] font-medium text-ink">{n.title}</p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">{fmtDateTime(n.at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppShell({ nav, roles, portal, children }: { nav: NavItem[]; roles: Role[]; portal: string; children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (!roles.includes(user.role)) router.replace(homeFor(user.role));
  }, [user, loading, roles, router, path]);

  if (loading || !user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[100dvh]">
        <div className="hidden w-64 border-r border-line bg-white lg:block" />
        <div className="flex-1 space-y-4 p-8"><Skeleton className="h-8 w-64" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-96" /></div>
      </div>
    );
  }
  const items = nav.filter((n) => !n.roles || n.roles.includes(user.role));
  const isActive = (n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/"));

  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex h-16 items-center justify-between px-5"><Logo light /><button className="lg:hidden" aria-label="Close menu" onClick={() => setDrawer(false)}><X className="size-5" /></button></div>
      <p className="px-5 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-navy-300">{portal}</p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((n) => (
          <li key={n.href}>
            <Link href={n.href} onClick={() => setDrawer(false)} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition", isActive(n) ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white")}>
              <n.icon className={cx("size-[18px]", isActive(n) ? "text-teal-100" : "text-navy-300")} strokeWidth={1.8} />{n.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-4 text-[11.5px] leading-relaxed text-navy-300">Research prototype. Supports, and does not replace, medical and veterinary judgement.</div>
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
          <div className="ml-auto flex items-center gap-2">
            <Notifications />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-semibold leading-tight text-navy-900">{user.full_name}</p>
              <p className="text-[11.5px] leading-tight text-muted">{user.role_name}{user.hospital_name ? ` · ${user.hospital_name}` : user.district_name ? ` · ${user.district_name}` : ""}</p>
            </div>
            <button onClick={logout} aria-label="Sign out" className="grid size-9 place-items-center rounded-lg text-navy-700 hover:bg-navy-50" title="Sign out"><LogOut className="size-[18px]" /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
