"use client";

import { Activity, CalendarCheck2, CalendarDays, ClipboardList, FilePlus2, Users } from "lucide-react";
import Link from "next/link";
import { BarList, SimpleArea, VBar, CHART } from "@/components/charts";
import { PointsMap } from "@/components/map";
import { Card, CardHeader, ErrorBanner, LinkButton, PageHeader, Skeleton, Stat, SyntheticNotice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/format";
import { useApi } from "@/lib/hooks";

type Dash = {
  scope: string; total: number; today: number; this_month: number; persons_affected: number; pending_follow_ups: number; follow_ups_due_7d: number;
  by_district: { name: string; count: number }[]; by_ward: { name: string; district: string; count: number }[];
  by_category: { key: string; name: string; count: number }[]; by_age: { key: string; name: string; count: number }[];
  by_month: { month: string; count: number }[]; pep_status: { key: string; name: string; count: number }[];
  points: { id: number; code: string; lat: number; lng: number; category: string; date: string }[]; is_synthetic_present: boolean;
};

export default function HospitalDashboard() {
  const { user } = useAuth();
  const { data: d, error, loading, reload } = useApi<Dash>("/bite-incidents/dashboard");
  return (
    <>
      <PageHeader
        title="Hospital dashboard"
        subtitle={d ? `Bite-incident reporting for ${d.scope}.` : "Bite-incident reporting overview."}
        actions={<><LinkButton href="/hospital/incidents" variant="secondary"><ClipboardList className="size-4" />Incident register</LinkButton><LinkButton href="/hospital/report"><FilePlus2 className="size-4" />New bite incident</LinkButton></>}
      />
      {d?.is_synthetic_present && <div className="mb-5"><SyntheticNotice /></div>}
      <ErrorBanner error={error} onRetry={reload} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total incidents reported" value={fmtNum(d?.total)} icon={Activity} loading={loading && !d} hint={d ? `${fmtNum(d.persons_affected)} persons affected` : undefined} />
        <Stat label="Reported today" value={fmtNum(d?.today)} icon={CalendarCheck2} tone="teal" loading={loading && !d} />
        <Stat label="Incidents this month" value={fmtNum(d?.this_month)} icon={CalendarDays} tone="sage" loading={loading && !d} />
        <Stat label="Pending clinical follow-ups" value={fmtNum(d?.pending_follow_ups)} icon={Users} tone="orange" loading={loading && !d} hint={d ? `${d.follow_ups_due_7d} due within 7 days` : undefined} />
        <Link href="/hospital/incidents?follow_up=pending" className="col-span-2 rounded-[14px] border border-dashed border-navy-200 bg-navy-50/50 p-5 text-sm text-navy-800 transition hover:border-navy-400 lg:col-span-1">
          <p className="font-semibold">Review follow-ups</p>
          <p className="mt-1 text-muted">Open the register filtered to pending follow-up cases.</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Geographic distribution" subtitle={user?.role === "hospital_staff" ? "Incidents reported by your facility" : "All facilities"} />
          <div className="p-3">{d ? <div className="overflow-hidden rounded-xl"><PointsMap points={d.points} className="h-[380px]" /></div> : <Skeleton className="h-[380px]" />}</div>
        </Card>
        <Card>
          <CardHeader title="Monthly trend" subtitle="Incidents by date of bite, last 12 months" />
          <div className="p-4">{d ? <SimpleArea data={d.by_month} dataKey="count" color={CHART.navy} height={170} /> : <Skeleton className="h-[170px]" />}</div>
          <div className="border-t border-line p-5">
            <p className="mb-3 text-[13px] font-medium text-navy-900">Injury category distribution</p>
            {d ? <BarList items={d.by_category} color={CHART.teal} /> : <Skeleton className="h-24" />}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="District-wise statistics" /><div className="p-5">{d ? <BarList items={d.by_district} /> : <Skeleton className="h-40" />}</div></Card>
        <Card><CardHeader title="Ward-wise statistics" subtitle="Top 12 wards" /><div className="p-5">{d ? <BarList items={d.by_ward.map((w) => ({ name: w.name, sub: w.district, count: w.count }))} color={CHART.sky} /> : <Skeleton className="h-40" />}</div></Card>
        <Card>
          <CardHeader title="Victim age groups" />
          <div className="p-4">{d ? <VBar data={d.by_age.map((a) => ({ name: a.key, count: a.count }))} xKey="name" bars={[{ key: "count", label: "Incidents", color: CHART.navy }]} height={220} /> : <Skeleton className="h-[220px]" />}</div>
        </Card>
      </div>
    </>
  );
}
