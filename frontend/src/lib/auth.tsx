"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type Role = "super_admin" | "medical_admin" | "hospital_staff" | "veterinary_officer" | "municipal_officer" | "community_reporter";
export type User = {
  id: number; email: string; full_name: string; designation: string | null; role: Role; role_name: string;
  hospital_id: number | null; hospital_name: string | null; district_id: number | null; district_name: string | null;
};

export const CONSOLE_ROLES: Role[] = ["super_admin", "medical_admin", "veterinary_officer", "municipal_officer"];
export const CLINICAL_ROLES: Role[] = ["super_admin", "medical_admin", "hospital_staff"];
export const ADMIN_ROLES: Role[] = ["super_admin", "medical_admin"];

export function homeFor(role: Role) {
  if (role === "hospital_staff") return "/hospital";
  if (role === "community_reporter") return "/community";
  return "/console";
}

type Ctx = { user: User | null; loading: boolean; refresh: () => Promise<void>; login: (email: string, password: string) => Promise<User>; logout: () => Promise<void>; setUser: (u: User) => void };
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<User>("/auth/me").then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api<{ user: User }>("/auth/login", { method: "POST", json: { email, password } });
    setUser(r.user);
    return r.user;
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/");
  };
  return <AuthCtx.Provider value={{ user, loading, refresh, login, logout, setUser }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
