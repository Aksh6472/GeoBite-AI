const IST = "Asia/Kolkata";

export function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: v.length === 10 ? undefined : IST });
}
export function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: IST });
}
export function fmtNum(n?: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("en-IN");
}
export function fmtPct(n?: number | null) {
  if (n === null || n === undefined) return "Not available";
  return `${(n * 100).toFixed(1)}%`;
}
export function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function nowLocalInput() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
