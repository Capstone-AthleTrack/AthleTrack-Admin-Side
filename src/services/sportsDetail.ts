// src/services/sportsDetail.ts
// Service layer for SportsDetail.tsx. No UI changes here.
import { useEffect, useRef } from "react";
import type {
  SupabaseClient,
  RealtimeChannel,
} from "@supabase/supabase-js";
import * as SB from "@/core/supabase";

// Resolve the Supabase client regardless of export style (named or default)
function getClient(mod: unknown): SupabaseClient {
  if (typeof mod === "object" && mod !== null) {
    if ("supabase" in mod) {
      const c = (mod as { supabase?: SupabaseClient }).supabase;
      if (c) return c;
    }
    if ("default" in mod) {
      const d = (mod as { default?: SupabaseClient }).default;
      if (d) return d;
    }
  }
  return mod as SupabaseClient;
}
const supabase: SupabaseClient = getClient(SB);

export type SportCode =
  | "basketball"
  | "baseball"
  | "softball"
  | "beach volleyball"
  | "football"
  | "futsal"
  | "volleyball"
  | "sepak-takraw";

export type TeamGender = "men's" | "women's";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;          // 'admin' | 'coach' | 'athlete'
  sport_norm: string;    // text from RPC
  team: string;          // text from RPC
  status: string | null;
}

type RpcAllowedTeam = { team: TeamGender };

export async function getAllowedTeamsForSport(
  sport: SportCode
): Promise<TeamGender[]> {
  const { data, error } = await supabase.rpc("allowed_teams_for_sport", {
    _sport: sport,
  });
  if (error) throw error;
  return (data ?? []).map((r: RpcAllowedTeam) => r.team);
}

export async function listProfilesBySportTeam(params: {
  sport: SportCode;
  team: TeamGender;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ProfileRow[]> {
  const { sport, team, search = "", page = 1, pageSize = 25 } = params;
  const { data, error } = await supabase.rpc(
    "admin_list_profiles_by_sport_team",
    {
      _sport: sport,
      _team: team,
      _search: search,
      _page: page,
      _page_size: pageSize,
    }
  );
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

/** Payload shape for realtime changes we care about */
type ProfileChangeRow = { sport_norm?: string | null; team?: string | null };
type ProfileChangePayload = {
  eventType: string;
  new: ProfileChangeRow | null;
  old: ProfileChangeRow | null;
};

/**
 * Optional realtime helper. Call inside a useEffect; returns an unsubscribe fn.
 * We subscribe broadly to 'profiles' and gate by sport/team in the callback to avoid JSX edits.
 */
export function subscribeProfilesBySportTeam(opts: {
  sport: SportCode;
  team: TeamGender;
  onAnyChange: () => void;
}): () => void {
  const { sport, team, onAnyChange } = opts;

  const channel: RealtimeChannel = supabase
    .channel(`profiles-${sport}-${team}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      (payload: ProfileChangePayload) => {
        const rec = (payload.new ?? payload.old) || {};
        const s = rec.sport_norm?.toString?.();
        const t = rec.team?.toString?.();
        if (s === sport && t === team) onAnyChange();
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (_e) {
      // ignore unsubscribe errors
      // keep non-empty for eslint-no-empty
      void _e;
    }
  };
}

/**
 * Tiny effect utility: re-run fn when deps change, skipping first mount.
 * Useful to call refetchers without touching JSX.
 */
export function useAfterMountEffect(effect: () => void, deps: unknown[]) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) effect();
    else mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
