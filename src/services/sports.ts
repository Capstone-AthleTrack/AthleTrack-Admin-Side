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
  flexibility: number | null;
  coordination: number | null;
  reactionTime: number | null;
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
  console.log("[loadSportBundle] Fetching data for sport_slug:", slug);

  // Convert slug to sport name for profiles table matching
  // e.g., "basketball" -> "basketball", "beach-volleyball" -> "beach volleyball"
  const sportName = slug.replace(/-/g, " ");

  // Step 1: Get coaches and athletes from profiles table directly
  const [coachesResult, athletesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .ilike("sport", sportName)
      .eq("role", "coach"),
    supabase
      .from("profiles")
      .select("id, full_name, pup_id, email, phone, role, birthdate")
      .ilike("sport", sportName)
      .eq("role", "athlete"),
  ]);

  if (coachesResult.error) throw coachesResult.error;
  if (athletesResult.error) throw athletesResult.error;

  // Map to expected types
  const coaches: VCoach[] = (coachesResult.data ?? []).map((c) => ({
    sport_slug: slug,
    coach_id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
  }));

  const athletes: VAthleteLite[] = (athletesResult.data ?? []).map((a) => ({
    sport_slug: slug,
    athlete_id: a.id, // Use 'id' from profiles as athlete_id
    full_name: a.full_name,
    pup_id: a.pup_id,
    pup_webmail: a.email,
    phone: a.phone,
    role: a.role,
    birthdate: a.birthdate,
  }));

  // Get athlete IDs for querying their data
  const athleteIds = athletes.map((a) => a.athlete_id);

  // Step 2: Get pre/post test data directly from athlete_tests table
  // Step 3: Get performance data directly from athlete_fitness_progress table
  const [testsResult, fitnessResult] = await Promise.all([
    athleteIds.length > 0
      ? supabase
          .from("athlete_tests")
          .select("user_id, pre_test, post_test")
          .in("user_id", athleteIds)
      : Promise.resolve({ data: [], error: null }),
    athleteIds.length > 0
      ? supabase
          .from("athlete_fitness_progress")
          .select("user_id, day, strength, power, agility, flexibility, coordination, reaction_time, average")
          .in("user_id", athleteIds)
          .order("day", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (testsResult.error) throw testsResult.error;
  if (fitnessResult.error) throw fitnessResult.error;

  // Aggregate pre/post test data per athlete (average of all their tests)
  const testsByAthlete = new Map<string, { preSums: number; postSums: number; count: number }>();
  for (const t of testsResult.data ?? []) {
    const existing = testsByAthlete.get(t.user_id) ?? { preSums: 0, postSums: 0, count: 0 };
    existing.preSums += Number(t.pre_test) || 0;
    existing.postSums += Number(t.post_test) || 0;
    existing.count += 1;
    testsByAthlete.set(t.user_id, existing);
  }

  const prepost: VPrePostOverview[] = Array.from(testsByAthlete.entries()).map(([id, agg]) => ({
    sport_slug: slug,
    athlete_id: id,
    pre_avg: agg.count > 0 ? agg.preSums / agg.count : null,
    post_avg: agg.count > 0 ? agg.postSums / agg.count : null,
  }));

  // Aggregate performance data by day (average across all athletes per day)
  const perfByDay = new Map<string, { strength: number; power: number; agility: number; flexibility: number; coordination: number; reactionTime: number; average: number; count: number }>();
  for (const f of fitnessResult.data ?? []) {
    const dayKey = f.day;
    const existing = perfByDay.get(dayKey) ?? { strength: 0, power: 0, agility: 0, flexibility: 0, coordination: 0, reactionTime: 0, average: 0, count: 0 };
    existing.strength += Number(f.strength) || 0;
    existing.power += Number(f.power) || 0;
    existing.agility += Number(f.agility) || 0;
    existing.flexibility += Number(f.flexibility) || 0;
    existing.coordination += Number(f.coordination) || 0;
    existing.reactionTime += Number(f.reaction_time) || 0;
    existing.average += Number(f.average) || 0;
    existing.count += 1;
    perfByDay.set(dayKey, existing);
  }

  const performance: VPerfOverview[] = Array.from(perfByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, agg]) => ({
      sport_slug: slug,
      week: day,
      strength: agg.count > 0 ? Math.round(agg.strength / agg.count * 10) / 10 : null,
      power: agg.count > 0 ? Math.round(agg.power / agg.count * 10) / 10 : null,
      agility: agg.count > 0 ? Math.round(agg.agility / agg.count * 10) / 10 : null,
      stamina: agg.count > 0 ? Math.round(agg.flexibility / agg.count * 10) / 10 : null,
      flexibility: agg.count > 0 ? Math.round(agg.flexibility / agg.count * 10) / 10 : null,
      coordination: agg.count > 0 ? Math.round(agg.coordination / agg.count * 10) / 10 : null,
      reactionTime: agg.count > 0 ? Math.round(agg.reactionTime / agg.count * 10) / 10 : null,
      average: agg.count > 0 ? Math.round(agg.average / agg.count * 10) / 10 : null,
    }));

  // Debug logging
  console.log("[loadSportBundle] Results for slug:", slug);
  console.log("  - coaches:", coaches.length, "rows");
  console.log("  - athletes:", athletes.length, "rows");
  console.log("  - prepost (from athlete_tests):", prepost.length, "rows", prepost);
  console.log("  - performance (from athlete_fitness_progress):", performance.length, "rows", performance);

  return { coaches, athletes, prepost, performance };
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
  flexibility: number;
  coordination: number;
  reactionTime: number;
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
    flexibility: r.flexibility ?? 0,
    coordination: r.coordination ?? 0,
    reactionTime: r.reactionTime ?? 0,
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
