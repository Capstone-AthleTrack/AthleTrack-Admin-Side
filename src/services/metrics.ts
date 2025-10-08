// src/services/metrics.ts
// Data access for Reports cards + Login Frequency + CSV (no UI edits).
// Assumes: path alias "@" -> /src and a named export { supabase } from "@/core/supabase"

import { supabase } from "@/core/supabase";

// ---- Types ------------------------------------------------------------------

export type Granularity = "daily" | "weekly" | "monthly";
export type UserRole = "admin" | "coach" | "athlete";

type VwDailyAppVisitsRow = {
  day: string; // YYYY-MM-DD
  visits: number;
};

type VwDailyActiveUsersRow = {
  day: string; // YYYY-MM-DD
  active_users: number;
};

type VwDailyLoginFrequencyRow = {
  day: string; // YYYY-MM-DD
  role: Extract<UserRole, "athlete" | "coach">;
  logins: number;
};

type AdminExportAppVisitsRow = {
  day: string; // YYYY-MM-DD
  visits: number;
  active_users: number;
};

type AdminExportLoginFrequencyRow = {
  day: string; // YYYY-MM-DD
  role: Extract<UserRole, "athlete" | "coach">;
  logins: number;
};

// ---- Helpers ----------------------------------------------------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function todayPH(): Date {
  // Admin is PH-based; server side buckets with 'Asia/Manila'
  // so we can use current local date for the admin panel.
  return new Date();
}

// ---- Logging RPCs ------------------------------------------------------------

/** Call from Athlete/Coach apps on app start/resume. Admins are ignored by RPC. */
export async function logSession(platform: string = "web"): Promise<string | null> {
  const { data, error } = await supabase.rpc("rpc_log_session", { _platform: platform });
  if (error) throw error;
  // Returns the inserted id or null when role is not athlete/coach
  return (data as string | null) ?? null;
}

/** Call after successful Athlete/Coach sign-in. Admins are ignored by RPC. */
export async function logLogin(): Promise<string | null> {
  const { data, error } = await supabase.rpc("rpc_log_login");
  if (error) throw error;
  return (data as string | null) ?? null;
}

// ---- Cards / Charts ----------------------------------------------------------

/** Reports cards: "App Visits" + "Active Users" for today (Asia/Manila day). */
export async function fetchDailyReports(): Promise<{ appVisits: number; activeUsers: number; day: string }> {
  const day = ymd(todayPH());

  const { data, error } = await supabase
    .from("vw_daily_app_visits")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;

  const { data: au, error: e2 } = await supabase
    .from("vw_daily_active_users")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (e2) throw e2;

  const visitsRow = (data as VwDailyAppVisitsRow | null) ?? null;
  const activeRow = (au as VwDailyActiveUsersRow | null) ?? null;

  return {
    appVisits: visitsRow?.visits ?? 0,
    activeUsers: activeRow?.active_users ?? 0,
    day,
  };
}

/** Login frequency series for a date range (default last 30 days, daily). */
export async function fetchLoginFrequency(
  from?: Date,
  to?: Date
): Promise<Array<{ day: string; athlete: number; coach: number }>> {
  const end = to ?? todayPH();
  const start = from ?? new Date(end.getTime() - 29 * 86400000); // last 30 days inclusive

  const { data, error } = await supabase
    .from("vw_daily_login_frequency")
    .select("*")
    .gte("day", ymd(start))
    .lte("day", ymd(end))
    .order("day", { ascending: true })
    .order("role", { ascending: true });

  if (error) throw error;

  const rows = ((data ?? []) as VwDailyLoginFrequencyRow[]);

  const byDay: Record<string, { athlete: number; coach: number }> = {};
  for (const row of rows) {
    const dayKey = row.day;
    const role: "athlete" | "coach" = row.role;
    const cnt = Number(row.logins ?? 0);
    if (!byDay[dayKey]) byDay[dayKey] = { athlete: 0, coach: 0 };
    byDay[dayKey][role] = cnt; // role is 'athlete' | 'coach'
  }

  // Ensure continuity: include days with 0s
  const out: Array<{ day: string; athlete: number; coach: number }> = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const key = ymd(cur);
    const row = byDay[key] ?? { athlete: 0, coach: 0 };
    out.push({ day: key, athlete: row.athlete, coach: row.coach });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ---- CSV helpers -------------------------------------------------------------

/** CSV rows for Reports (App Visits + Active Users) */
export async function getReportsCSVRows(params?: {
  from?: Date;
  to?: Date;
}): Promise<Array<{ day: string; visits: number; active_users: number }>> {
  const end = params?.to ?? todayPH();
  const start = params?.from ?? new Date(end.getTime() - 29 * 86400000);

  const { data, error } = await supabase.rpc("admin_export_app_visits", {
    _from: ymd(start),
    _to: ymd(end),
  });
  if (error) throw error;

  const rows = ((data ?? []) as AdminExportAppVisitsRow[]);
  return rows.map((r) => ({
    day: r.day,
    visits: Number(r.visits ?? 0),
    active_users: Number(r.active_users ?? 0),
  }));
}

/** CSV rows for Login Frequency (wide) */
export async function getLoginCSVRows(params?: {
  from?: Date;
  to?: Date;
}): Promise<Array<{ day: string; athletes: number; coaches: number }>> {
  const end = params?.to ?? todayPH();
  const start = params?.from ?? new Date(end.getTime() - 29 * 86400000);

  const { data, error } = await supabase.rpc("admin_export_login_frequency", {
    _from: ymd(start),
    _to: ymd(end),
  });
  if (error) throw error;

  const rows = ((data ?? []) as AdminExportLoginFrequencyRow[]);

  // pivot to day -> athletes/coaches
  const byDay: Record<string, { athletes: number; coaches: number }> = {};
  for (const r of rows) {
    const dayKey = r.day;
    const cnt = Number(r.logins ?? 0);
    if (!byDay[dayKey]) byDay[dayKey] = { athletes: 0, coaches: 0 };
    if (r.role === "athlete") byDay[dayKey].athletes = cnt;
    else if (r.role === "coach") byDay[dayKey].coaches = cnt;
  }

  const out: Array<{ day: string; athletes: number; coaches: number }> = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const key = ymd(cur);
    const row = byDay[key] ?? { athletes: 0, coaches: 0 };
    out.push({ day: key, athletes: row.athletes, coaches: row.coaches });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// Generic CSV builder without `any`
type RowRecord = Record<string, unknown>;

function rowsToCSV<T extends RowRecord>(rows: T[], header: Array<keyof T & string>): string {
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    const line = header.map((h) => esc(r[h])).join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

export async function exportReportsCSV(params?: { from?: Date; to?: Date; filename?: string }) {
  const rows = await getReportsCSVRows(params);
  const csv = rowsToCSV(rows, ["day", "visits", "active_users"]);
  const fname = params?.filename ?? `reports_${rows[0]?.day ?? ymd(todayPH())}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportLoginCSV(params?: { from?: Date; to?: Date; filename?: string }) {
  const rows = await getLoginCSVRows(params);
  const csv = rowsToCSV(rows, ["day", "athletes", "coaches"]);
  const fname = params?.filename ?? `login_frequency_${rows[0]?.day ?? ymd(todayPH())}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
