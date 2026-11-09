"use client";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  data: unknown;
  constructor(status: number, message: string, fields: Record<string, string> = {}, data?: unknown) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.data = data;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Params): string {
  if (!params) return "";
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

function parseError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown })?.detail;
  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    const msgs: string[] = [];
    detail.forEach((e: { field?: string; loc?: unknown[]; msg?: string }) => {
      const f = e.field ?? (Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "");
      if (f) fields[f] = e.msg ?? "Invalid value";
      msgs.push(f ? `${f.replace(/_/g, " ")}: ${e.msg}` : String(e.msg));
    });
    return new ApiError(status, msgs.join("; ") || "Validation failed", fields, body);
  }
  if (detail && typeof detail === "object") {
    return new ApiError(status, String((detail as { message?: string }).message ?? "Request failed"), {}, detail);
  }
  const fallback: Record<number, string> = {
    401: "Please sign in to continue.",
    403: "You do not have access to this resource.",
    404: "Not found.",
    429: "Too many requests. Please wait and try again.",
    500: "The server encountered an error. Please try again.",
  };
  return new ApiError(status, typeof detail === "string" ? detail : fallback[status] ?? `Request failed (${status})`, {}, body);
}

export async function api<T = unknown>(path: string, opts: RequestInit & { params?: Params; json?: unknown } = {}): Promise<T> {
  const { params, json, headers, ...rest } = opts;
  const init: RequestInit = { credentials: "same-origin", ...rest, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers } };
  if (json !== undefined) init.body = JSON.stringify(json);
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs(params)}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the GeoBite-AI server. Check that the API is running.");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw parseError(res.status, body);
  return body as T;
}

export function downloadUrl(path: string, params?: Params) {
  return `/api${path}${qs(params)}`;
}
