"use client";

import { BellRing, BrainCircuit, ClipboardCheck, ClipboardList, FileClock, LayoutDashboard, Map, Syringe, UsersRound } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import { CONSOLE_ROLES } from "@/lib/auth";

const nav: NavItem[] = [
  { href: "/console", label: "Intelligence dashboard", icon: LayoutDashboard, exact: true },
  { href: "/console/map", label: "GIS map", icon: Map },
  { href: "/console/alerts", label: "Alerts & interventions", icon: BellRing },
  { href: "/console/moderation", label: "Verification queue", icon: ClipboardCheck },
  { href: "/console/analytics", label: "Hotspots & AI models", icon: BrainCircuit },
  { href: "/console/vaccination", label: "Vaccination records", icon: Syringe },
  { href: "/hospital/incidents", label: "Hospital register", icon: ClipboardList, roles: ["super_admin", "medical_admin"] },
  { href: "/console/users", label: "Users & roles", icon: UsersRound, roles: ["super_admin", "medical_admin"] },
  { href: "/console/audit", label: "Audit log", icon: FileClock, roles: ["super_admin", "medical_admin"] },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={nav} roles={CONSOLE_ROLES} portal="Intelligence console">{children}</AppShell>;
}
