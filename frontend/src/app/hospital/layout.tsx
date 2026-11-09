"use client";

import { ClipboardList, FilePlus2, LayoutDashboard, Map } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import { CLINICAL_ROLES } from "@/lib/auth";

const nav: NavItem[] = [
  { href: "/hospital", label: "Hospital dashboard", icon: LayoutDashboard, exact: true },
  { href: "/hospital/report", label: "New bite incident", icon: FilePlus2 },
  { href: "/hospital/incidents", label: "Incident register", icon: ClipboardList },
  { href: "/hospital/map", label: "GIS incident map", icon: Map },
];

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav} roles={CLINICAL_ROLES} portal="Hospital reporting">{children}</AppShell>;
}
