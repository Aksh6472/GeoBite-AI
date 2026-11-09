"use client";

import { Dog, LayoutDashboard, SearchCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/AppShell";
import { cx } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth";

const NAV = [
  { href: "/community", label: "Dashboard", icon: LayoutDashboard },
  { href: "/community/report", label: "Report dogs", icon: Dog },
  { href: "/community/track", label: "Track a report", icon: SearchCheck },
];

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user } = useAuth();
  return (
    <div className="min-h-[100dvh] pb-20 md:pb-0">
      <header className="sticky top-0 z-[900] border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ml-6 hidden gap-1 md:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className={cx("rounded-lg px-3 py-2 text-sm font-medium", path === n.href ? "bg-teal-50 text-teal-700" : "text-navy-700 hover:bg-navy-50")}>{n.label}</Link>)}
          </nav>
          <div className="ml-auto text-sm">
            {user ? <Link href={user.role === "community_reporter" ? "/community" : homeFor(user.role)} className="font-medium text-navy-800">{user.full_name}</Link> : <Link href="/login?next=/community" className="font-medium text-navy-800 hover:underline">Sign in</Link>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-[900] grid grid-cols-3 border-t border-line bg-white md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[11.5px] font-medium", path === n.href ? "text-teal-700" : "text-navy-600")}>
            <n.icon className="size-5" strokeWidth={1.8} />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
