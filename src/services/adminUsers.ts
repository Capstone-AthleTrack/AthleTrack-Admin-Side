// src/services/adminUsers.ts
import { supabase } from '@/core/supabase';

export type DBRole = 'admin' | 'coach' | 'athlete' | 'user' | null;
export type DBStatus = 'pending' | 'accepted' | 'decline' | 'disabled' | null;

export type SportCode =
  | 'baseball' | 'basketball' | 'beach volleyball' | 'football'
  | 'futsal' | 'sepak-takraw' | 'softball' | 'volleyball' | null;

export type TeamGender = "men's" | "women's" | null;

export type ProfileRowLike = {
  id: string;
  email: string | null;
  full_name: string | null;
  pup_id: string | null;
  phone: string | null;
  role: DBRole;
  sport: string | null;     // keep as string for existing UI
  team?: TeamGender | null; // may be unused in some UIs
  status: DBStatus;
  created_at: string | null;
  is_admin_panel_allowed?: boolean; // Allows coaches to access admin panel
};

// Row shape returned by RPC admin_list_users
type RpcAdminListUsersRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  pup_id: string | null;
  phone: string | null;
  role: Exclude<DBRole, null>;
  sport: Exclude<SportCode, null> | null; // enum or null
  team: TeamGender;
  status: Exclude<DBStatus, null>;
  created_at: string | null;
  is_admin_panel_allowed?: boolean;
};

type EditableRole = 'admin' | 'coach' | 'athlete';
export const ALLOWED_ROLES: readonly EditableRole[] = ['admin','coach','athlete'];

export const ALLOWED_SPORTS: readonly Exclude<SportCode, null>[] = [
  'baseball','basketball','beach volleyball','football',
  'futsal','sepak-takraw','softball','volleyball'
];

function isEditableRole(r: DBRole | null): r is EditableRole {
  return r === 'admin' || r === 'coach' || r === 'athlete';
}

export function normalizeSport(s?: string | null): SportCode {
  if (!s) return null;
  const x = s.toLowerCase().replace(/\s+/g,' ').trim();
  if (x === 'beach-volleyball' || x === 'beachvolleyball') return 'beach volleyball';
  if (x === 'sepak takraw' || x === 'sepaktakraw') return 'sepak-takraw';
  if (x === 'soccer') return 'football';
  return (ALLOWED_SPORTS as readonly string[]).includes(x) ? (x as SportCode) : null;
}

export function validateSportTeam(sport: SportCode, team: TeamGender): true | string {
  if (!sport || !team) return true; // server enforces final check; client lets empty pass
  const ok =
    (sport === 'basketball'       && (team === "men's" || team === "women's")) ||
    (sport === 'baseball'         && team === "men's") ||
    (sport === 'softball'         && team === "women's") ||
    (sport === 'beach volleyball' && (team === "men's" || team === "women's")) ||
    (sport === 'football'         && team === "men's") ||
    (sport === 'futsal'           && (team === "men's" || team === "women's")) ||
    (sport === 'volleyball'       && (team === "men's" || team === "women's")) ||
    (sport === 'sepak-takraw'     && (team === "men's" || team === "women's"));
  return ok ? true : `Invalid team ${team ?? ''} for sport ${sport}`;
}

// Typed wrapper so we don't need rpc generics
async function rpcAdminListUsers(args: {
  search: string;
  role_filter: 'all' | EditableRole;
  sport_filter: 'all' | Exclude<SportCode, null>;
  page: number;
  page_size: number;
}): Promise<RpcAdminListUsersRow[]> {
  const { data, error } = await supabase.rpc('admin_list_users', args);
  if (error) throw error;
  return (data ?? []) as RpcAdminListUsersRow[];
}

export async function listUsers(params?: {
  search?: string;
  role?: 'all' | EditableRole;
  sport?: 'all' | Exclude<SportCode,null>;
  page?: number;
  pageSize?: number;
}): Promise<ProfileRowLike[]> {
  const { search = '', role = 'all', sport = 'all', page = 1, pageSize = 25 } = params || {};

  const rowsIn = await rpcAdminListUsers({
    search,
    role_filter: role,
    sport_filter: sport,
    page,
    page_size: pageSize,
  });

  const rows: ProfileRowLike[] = rowsIn.map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    pup_id: r.pup_id,
    phone: r.phone,
    role: r.role ?? null,
    sport: (r.sport ?? null) as string | null,
    team: r.team ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? null,
    is_admin_panel_allowed: r.is_admin_panel_allowed ?? false,
  }));

  return rows;
}

export async function updateUserEditableFields(args: {
  id: string;
  role?: DBRole | null;
  sport?: string | null;
  team?: TeamGender | null; // optional in UI
}): Promise<void> {
  const role = args.role ? (args.role.toLowerCase() as DBRole) : null;
  if (role && !isEditableRole(role)) {
    throw new Error('Only Admin, Coach, or Athlete roles are allowed.');
  }

  const sport = normalizeSport(args.sport ?? null);
  const team = args.team ?? null;
  const v = validateSportTeam(sport, team);
  if (v !== true) throw new Error(v);

  const { error } = await supabase.rpc('admin_update_user_profile', {
    _user_id: args.id,
    _role: (role ?? null) as EditableRole | null,
    _sport: sport,
    _team: team,
  });
  if (error) throw error;
}

/**
 * Toggle admin panel access for a user (typically used for coaches)
 * When enabled, allows the user to access the admin web panel
 */
export async function setAdminPanelAccess(userId: string, allowed: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_admin_panel_allowed: allowed })
    .eq('id', userId);
  
  if (error) throw error;
}

/**
 * Check if a user can access the admin panel
 * Returns true for admins OR users with is_admin_panel_allowed = true
 */
export function canAccessAdminPanel(role: DBRole, isAdminPanelAllowed?: boolean): boolean {
  return role === 'admin' || isAdminPanelAllowed === true;
}

/**
 * Get the display label for a user's admin access type
 */
export function getAdminTypeLabel(role: DBRole, isAdminPanelAllowed?: boolean): string {
  if (role === 'admin') return 'Full Admin';
  if (role === 'coach' && isAdminPanelAllowed) return 'Admin Coach';
  if (isAdminPanelAllowed) return 'Has Admin Access';
  return 'No Admin Access';
}
