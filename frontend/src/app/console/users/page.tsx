"use client";

import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorBanner, Field, Input, PageHeader, Select, Skeleton, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { useApi, useGeoTree, useVocab } from "@/lib/hooks";

type U = User & { is_active: boolean; last_login_at: string | null; created_at: string };

export default function Users() {
  const { user } = useAuth();
  const vocab = useVocab();
  const { districts } = useGeoTree();
  const [role, setRole] = useState("");
  const { data, error, reload } = useApi<U[]>("/admin/users", { role });
  const isSuper = user?.role === "super_admin";
  const [hospitals, setHospitals] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { api<{ id: number; name: string }[]>("/meta/hospitals").then(setHospitals).catch(() => {}); }, []);
  const [f, setF] = useState({ email: "", full_name: "", designation: "", role: "veterinary_officer", password: "", district_id: "", hospital_id: "" });
  const [err, setErr] = useState<Error | null>(null);
  const [open, setOpen] = useState(false);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setErr(null);
    try { await api(`/admin/users/${id}`, { method: "PATCH", json: body }); reload(); } catch (e) { setErr(e as Error); }
  };

  return (
    <>
      <PageHeader title="Users and roles" subtitle="Role-based access: each role sees only the data and actions its responsibility requires. Field officers can be scoped to a district." actions={isSuper && <Button onClick={() => setOpen(!open)}><UserPlus className="size-4" />Add user</Button>} />
      <ErrorBanner error={err} />
      {open && isSuper && (
        <Card className="mb-5">
          <CardHeader title="Create account" />
          <form className="grid gap-4 p-5 md:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("/admin/users", { method: "POST", json: { ...f, district_id: f.district_id ? Number(f.district_id) : null, hospital_id: f.hospital_id ? Number(f.hospital_id) : null, designation: f.designation || null } }); setOpen(false); reload(); } catch (x) { setErr(x as Error); } }}>
            <Field label="Full name" htmlFor="fn" required><Input id="fn" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Email" htmlFor="em" required><Input id="em" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Temporary password" htmlFor="pw" required hint="10+ characters, letters and numbers"><Input id="pw" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Role" htmlFor="ro"><Select id="ro" value={f.role} options={vocab?.roles ?? []} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
            <Field label="District scope" htmlFor="di"><Select id="di" placeholder="All districts" value={f.district_id} options={districts.map((d) => ({ value: d.id, label: d.name }))} onChange={(e) => setF({ ...f, district_id: e.target.value })} /></Field>
            {f.role === "hospital_staff" ? <Field label="Facility" htmlFor="ho"><Select id="ho" placeholder="Select" value={f.hospital_id} options={hospitals.map((h) => ({ value: h.id, label: h.name }))} onChange={(e) => setF({ ...f, hospital_id: e.target.value })} /></Field> : <Field label="Designation" htmlFor="de"><Input id="de" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>}
            <div className="md:col-span-3"><Button type="submit">Create user</Button></div>
          </form>
        </Card>
      )}
      <div className="mb-4 w-full sm:w-64"><Select aria-label="Filter role" placeholder="All roles" value={role} options={vocab?.roles ?? []} onChange={(e) => setRole(e.target.value)} /></div>
      <Card>
        <ErrorBanner error={error} />
        {!data ? <div className="p-4"><Skeleton className="h-64" /></div> : (
          <Table head={["Name", "Role", "Facility / district", "Last sign-in", "Status", ""]}>
            {data.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-medium">{u.full_name}<span className="block text-xs font-normal text-muted">{u.email}</span></td>
                <td className="px-4 py-2.5">{isSuper && u.id !== user?.id ? <Select aria-label="Role" className="h-8 w-48 text-[13px]" value={u.role} options={vocab?.roles ?? []} onChange={(e) => patch(u.id, { role: e.target.value })} /> : u.role_name}</td>
                <td className="px-4 py-2.5 text-muted">{u.hospital_name ?? u.district_name ?? "All districts"}</td>
                <td className="px-4 py-2.5 text-muted">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Never"}</td>
                <td className="px-4 py-2.5"><Badge tone={u.is_active ? "green" : "gray"}>{u.is_active ? "Active" : "Disabled"}</Badge></td>
                <td className="px-4 py-2.5">{isSuper && u.id !== user?.id && <Button size="sm" variant="secondary" onClick={() => patch(u.id, { is_active: !u.is_active })}>{u.is_active ? "Disable" : "Enable"}</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Role permissions" />
        <div className="grid gap-x-8 gap-y-3 p-5 text-[13px] md:grid-cols-2">{vocab?.roles.map((r) => <p key={r.value}><span className="font-medium text-navy-900">{r.label}:</span> <span className="text-muted">{r.description}</span></p>)}</div>
      </Card>
    </>
  );
}
