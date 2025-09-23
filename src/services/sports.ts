// src/services/sports.ts
import supabase from "@/core/supabase"; // ← if yours is a named export, change to: import { supabase } from "@/core/supabase";

/** ── Row types coming from our DB VIEWS ──────────────────────────────────── */
export type VSport = {
  sport_slug: string;
  sport: string | null;
  coaches: number | null;
  athletes: number | null;
};

export type VCoach = {
  sport_slug: string;
  coach_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export type VAthleteLite = {
  sport_slug: string;
  athlete_id: string;
  full_name: string | null;
  pup_id: string | null;
  pup_webmail: string | null;
  phone: string | null;
  role: string | null;
  birthdate: string | null; // ISO date or null
};

export type VPrePostOverview = {
  sport_slug: string;
  athlete_id: string;
  pre_avg: number | null;
  post_avg: number | null;
};

export type VPerfOverview = {
  sport_slug: string;
  week: string; // ISO date (yyyy-mm-dd)
  strength: number | null;
  power: number | null;
  agility: number | null;
  stamina: number | null;
  average: number | null;
};

export type VAthletePrePost = {
  athlete_id: string;
  cycle_day: number | null;
  pre_test: number | null;
  post_test: number | null;
  pre_date: string | null;
  post_date: string | null;
};

export type VAthletePerf = {
  athlete_id: string;
  day: string; // ISO date
  strength: number | null;
  power: number | null;
  agility: number | null;
  stamina: number | null;
  average: number | null;
};

export type ProfileLite = {
  user_id: string;
  full_name: string | null;
  pup_id: string | null;
  pup_webmail: string | null;
  phone: string | null;
  role: string | null;
  sport: string | null;
  birthdate: string | null;
};

/** ── Simple selects from views (use .returns<...> instead of from<T>) ─────── */
export async function listSports(): Promise<VSport[]> {
  const { data, error } = await supabase
    .from("v_sports")
    .select("*")
    .order("sport", { ascending: true })
    .returns<VSport[]>();
  if (error) throw error;
  return data ?? [];
}

export async function loadSportBundle(
  slug: string
): Promise<{
  coaches: VCoach[];
  athletes: VAthleteLite[];
  prepost: VPrePostOverview[];
  performance: VPerfOverview[];
}> {
  const [coaches, athletes, prepost, performance] = await Promise.all([
    supabase
      .from("v_sport_coaches")
      .select("*")
      .eq("sport_slug", slug)
      .returns<VCoach[]>(),
    supabase
      .from("v_sport_athletes")
      .select("*")
      .eq("sport_slug", slug)
      .returns<VAthleteLite[]>(),
    supabase
      .from("v_sport_prepost_overview")
      .select("*")
      .eq("sport_slug", slug)
      .returns<VPrePostOverview[]>(),
    supabase
      .from("v_sport_performance_overview")
      .select("*")
      .eq("sport_slug", slug)
      .order("week", { ascending: true })
      .returns<VPerfOverview[]>(),
  ]);

  if (coaches.error) throw coaches.error;
  if (athletes.error) throw athletes.error;
  if (prepost.error) throw prepost.error;
  if (performance.error) throw performance.error;

  return {
    coaches: coaches.data ?? [],
    athletes: athletes.data ?? [],
    prepost: prepost.data ?? [],
    performance: performance.data ?? [],
  };
}

export async function loadAthleteBundle(
  athleteId: string
): Promise<{
  profile: ProfileLite;
  prepost: VAthletePrePost[];
  performance: VAthletePerf[];
}> {
  const [profile, prepost, performance] = await Promise.all([
    supabase
      .from("v_profile_lite")
      .select("*")
      .eq("user_id", athleteId)
      .single()
      .returns<ProfileLite>(),
    supabase
      .from("v_athlete_prepost_series")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("cycle_day", { ascending: true })
      .returns<VAthletePrePost[]>(),
    supabase
      .from("v_athlete_performance_series")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("day", { ascending: true })
      .returns<VAthletePerf[]>(),
  ]);

  if (profile.error) throw profile.error;
  if (prepost.error) throw prepost.error;
  if (performance.error) throw performance.error;

  return {
    profile: (profile.data as ProfileLite)!,
    prepost: prepost.data ?? [],
    performance: performance.data ?? [],
  };
}

/** ── Chart-friendly shapes (fully typed) ─────────────────────────────────── */
export type ChartPrePostBar = { label: string; preTest: number; postTest: number };
export type ChartPerfLine = {
  week: string;
  agility: number;
  power: number;
  strength: number;
  stamina: number;
  average: number;
};
export type ChartAthletePrePost = { label: number | string; preTest: number; postTest: number };
export type ChartAthletePerf = {
  day: string;
  agility: number;
  power: number;
  strength: number;
  stamina: number;
  average: number;
};

export function shapePrePostBars(
  rows: VPrePostOverview[],
  athletes: VAthleteLite[]
): ChartPrePostBar[] {
  const nameById = new Map<string, string>(
    athletes.map((a) => [a.athlete_id, a.full_name ?? "—"])
  );
  return rows.map((r) => ({
    label: nameById.get(r.athlete_id) ?? r.athlete_id.slice(0, 6),
    preTest: r.pre_avg ?? 0,
    postTest: r.post_avg ?? 0,
  }));
}

export function shapePerfLines(rows: VPerfOverview[]): ChartPerfLine[] {
  return rows.map((r) => ({
    week: r.week,
    agility: r.agility ?? 0,
    power: r.power ?? 0,
    strength: r.strength ?? 0,
    stamina: r.stamina ?? 0,
    average: r.average ?? 0,
  }));
}

export function shapeAthletePrePost(rows: VAthletePrePost[]): ChartAthletePrePost[] {
  return rows.map((r) => ({
    label: r.cycle_day ?? 0, // or format from dates if you prefer
    preTest: r.pre_test ?? 0,
    postTest: r.post_test ?? 0,
  }));
}

export function shapeAthletePerf(rows: VAthletePerf[]): ChartAthletePerf[] {
  return rows.map((r) => ({
    day: r.day,
    agility: r.agility ?? 0,
    power: r.power ?? 0,
    strength: r.strength ?? 0,
    stamina: r.stamina ?? 0,
    average: r.average ?? 0,
  }));
}

/** ── Typed CSV helper (no any) ───────────────────────────────────────────── */
export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[]
): void {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const lines: string[] = [];

  lines.push(headers.join(","));
  for (const r of rows) {
    const vals = headers.map((h) => JSON.stringify(r[h] ?? ""));
    lines.push(vals.join(","));
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
