// src/services/offline/users.offline.ts
// Offline-enabled wrapper for user management operations

import { cachedQuery, queueAdd, getNetworkStatus, cacheDelete } from '@/core/offline';
import { supabase } from '@/core/supabase';

// Cache TTLs
const USERS_LIST_TTL = 5 * 60 * 1000; // 5 minutes

// ---- Types ----
export type DBRole = 'admin' | 'coach' | 'athlete' | 'user' | null;
export type DBStatus = 'pending' | 'accepted' | 'decline' | 'disabled' | null;

export interface UserProfile {
  id: string;
  email: string | null;
  role: DBRole;
  status: DBStatus;
  full_name: string | null;
  phone: string | null;
  pup_id: string | null;
  sport: string | null;
  team: string | null;
  created_at: string | null;
  is_admin_panel_allowed?: boolean;
}

export interface UserProfileInsert {
  email: string;
  role?: DBRole;
  status?: DBStatus;
  full_name?: string | null;
  phone?: string | null;
  pup_id?: string | null;
  sport?: string | null;
  team?: string | null;
}

export interface UserProfileUpdate {
  role?: DBRole;
  sport?: string | null;
  team?: string | null;
  is_admin_panel_allowed?: boolean | null;
}

// ---- Cache Keys ----
const CACHE_KEYS = {
  usersList: () => 'admin:users:list',
  user: (id: string) => `admin:users:${id}`,
};

// ---- Normalization Helpers ----
function normSport(input?: string | null): string | null {
  if (!input) return null;
  let s = input.normalize('NFKC').toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');
  const map: Record<string, string> = {
    basketball: 'basketball',
    volleyball: 'volleyball',
    'beach volleyball': 'beach volleyball',
    futsal: 'futsal',
    'sepak-takraw': 'sepak-takraw',
    'sepak takraw': 'sepak-takraw',
    softball: 'softball',
    baseball: 'baseball',
    football: 'football',
  };
  return map[s] ?? s;
}

function normTeam(input?: string | null): string | null {
  if (!input) return null;
  const t = input.normalize('NFKC').toLowerCase().replace(/[''`]/g, '').trim();
  // Database enum values are "men's" and "women's"
  if (t === 'men' || t === 'mens' || t === "men's") return "men's";
  if (t === 'women' || t === 'womens' || t === "women's") return "women's";
  if (t.includes('women')) return "women's";
  if (t.includes('men')) return "men's";
  return null;
}

function normalizeStatus(s?: string | null): DBStatus {
  const v = String(s ?? '').toLowerCase();
  if (v === 'accepted' || v === 'active') return 'accepted';
  if (v === 'decline' || v === 'denied' || v === 'suspended') return 'decline';
  if (v === 'disabled') return 'disabled';
  if (v === 'pending' || v === '') return 'pending';
  return 'pending';
}

// ---- Read Operations (with caching) ----

/**
 * Fetch all users with offline caching
 * Also fetches pup_id from account_requests if missing in profiles
 */
export async function fetchUsersOffline(): Promise<{
  data: UserProfile[];
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    async () => {
      // Try view first
      try {
        const { data: viewRows, error: viewErr } = await supabase
          .from('v_users_admin')
          .select('*')
          .order('created_at', { ascending: false });

        if (!viewErr && Array.isArray(viewRows)) {
          const users = viewRows.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ''),
            email: row.email as string | null,
            role: (String(row.role ?? '').toLowerCase() as DBRole) || null,
            status: normalizeStatus(row.status as string | null),
            full_name: row.full_name as string | null,
            phone: row.phone as string | null,
            pup_id: row.pup_id as string | null,
            sport: row.sport as string | null,
            team: row.team as string | null,
            created_at: row.created_at as string | null,
            is_admin_panel_allowed: row.is_admin_panel_allowed as boolean | undefined,
          }));
          
          // Enrich with pup_id from account_requests if missing
          return await enrichWithPupIds(users);
        }
      } catch {
        // Fall through to direct table read
      }

      // Fallback to direct table
      const { data: rows, error } = await supabase
        .from('profiles')
        .select('id,email,role,status,full_name,phone,pup_id,sport,team,created_at,is_admin_panel_allowed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const users = (rows ?? []).map((p) => ({
        ...p,
        status: normalizeStatus(p.status),
      })) as UserProfile[];

      // Enrich with pup_id from account_requests if missing
      return await enrichWithPupIds(users);
    },
    {
      key: CACHE_KEYS.usersList(),
      ttl: USERS_LIST_TTL,
      strategy: 'stale-while-revalidate', // Show cached immediately, refresh in background
    }
  );
}

/**
 * Enrich user profiles with pup_id from multiple sources:
 * 1. Already in profiles (primary source)
 * 2. From account_requests (fallback)
 * 3. Re-fetch from profiles by user_id if still missing (double-check)
 */
async function enrichWithPupIds(users: UserProfile[]): Promise<UserProfile[]> {
  // Find users with missing pup_id
  const usersWithoutPupId = users.filter((u) => !u.pup_id);
  
  if (usersWithoutPupId.length === 0) {
    return users;
  }

  // Create lookup maps for enrichment
  const pupIdByEmail: Record<string, string> = {};
  const pupIdByUserId: Record<string, string> = {};

  try {
    // 1. First, try to get pup_id from account_requests
    const emails = usersWithoutPupId
      .map((u) => u.email)
      .filter((e): e is string => !!e);
    
    const userIds = usersWithoutPupId
      .map((u) => u.id)
      .filter((id): id is string => !!id);

    if (emails.length > 0) {
      const { data: requestsByEmail } = await supabase
        .from('account_requests')
        .select('email, pup_id, user_id')
        .in('email', emails);

      if (requestsByEmail) {
        for (const req of requestsByEmail) {
          if (req.pup_id) {
            if (req.email) pupIdByEmail[req.email.toLowerCase()] = req.pup_id;
            if (req.user_id) pupIdByUserId[req.user_id] = req.pup_id;
          }
        }
      }
    }

    // 2. Also check account_requests by user_id (some records might link differently)
    if (userIds.length > 0) {
      const { data: requestsByUserId } = await supabase
        .from('account_requests')
        .select('email, pup_id, user_id')
        .in('user_id', userIds);

      if (requestsByUserId) {
        for (const req of requestsByUserId) {
          if (req.pup_id) {
            if (req.email) pupIdByEmail[req.email.toLowerCase()] = req.pup_id;
            if (req.user_id) pupIdByUserId[req.user_id] = req.pup_id;
          }
        }
      }
    }

    // 3. Double-check profiles table directly for any pup_id we might have missed
    // (in case the initial fetch didn't include it or view doesn't have it)
    const stillMissing = usersWithoutPupId.filter((u) => {
      const foundInRequests = 
        (u.id && pupIdByUserId[u.id]) ||
        (u.email && pupIdByEmail[u.email.toLowerCase()]);
      return !foundInRequests;
    });

    if (stillMissing.length > 0) {
      const missingIds = stillMissing.map((u) => u.id).filter(Boolean) as string[];
      
      if (missingIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, pup_id')
          .in('id', missingIds)
          .not('pup_id', 'is', null);

        if (profilesData) {
          for (const p of profilesData) {
            if (p.pup_id && p.id) {
              pupIdByUserId[p.id] = p.pup_id;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[users] Failed to enrich pup_ids:', err);
  }

  // Enrich users with found pup_ids
  return users.map((user) => {
    if (user.pup_id) return user;
    
    // Try to find pup_id by user_id first, then by email
    const pupId = 
      (user.id && pupIdByUserId[user.id]) ||
      (user.email && pupIdByEmail[user.email.toLowerCase()]) ||
      null;
    
    return pupId ? { ...user, pup_id: pupId } : user;
  });
}

// ---- Write Operations (with offline queuing) ----

/**
 * Add a new user with offline queuing
 */
export async function addUserOffline(user: UserProfileInsert): Promise<{ queued: boolean }> {
  const payload = {
    email: user.email,
    role: user.role ?? 'athlete',
    status: 'accepted' as DBStatus,
    full_name: user.full_name ?? null,
    phone: user.phone ?? null,
    pup_id: user.pup_id ?? null,
    sport: normSport(user.sport),
    team: normTeam(user.team),
  };

  if (getNetworkStatus()) {
    try {
      const { error } = await supabase.from('profiles').insert(payload);
      if (error) throw error;
      
      // Invalidate cache
      await cacheDelete(CACHE_KEYS.usersList());
      return { queued: false };
    } catch (error) {
      console.warn('[users] Add failed, queuing for later:', error);
    }
  }

  // Queue for later sync
  await queueAdd('admin:addUser', payload);
  return { queued: true };
}

/**
 * Update user (role, sport, team, is_admin_panel_allowed) with offline queuing
 * Uses direct database update (Edge Function is unreliable for role changes)
 */
export async function updateUserOffline(
  userId: string,
  updates: UserProfileUpdate
): Promise<{ queued: boolean }> {
  // Debug: Log incoming updates
  console.log('[users] updateUserOffline called with:', { userId, updates });

  // Normalize team to database enum values ("men's" or "women's")
  const normalizedTeam = normTeam(updates.team);
  
  // Debug: Log normalization result
  console.log('[users] normTeam result:', { input: updates.team, output: normalizedTeam });
  
  const payload = {
    user_id: userId,
    sport: normSport(updates.sport),
    team: normalizedTeam,
    role: updates.role,
    is_admin_panel_allowed: updates.is_admin_panel_allowed,
  };

  console.log('[users] updateUserOffline payload:', { userId, payload });

  if (getNetworkStatus()) {
    // Build update object for direct DB (only include defined values)
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.sport !== undefined && payload.sport !== null) updateData.sport = payload.sport;
    if (payload.team !== undefined && payload.team !== null) updateData.team = payload.team;
    if (payload.role !== undefined && payload.role !== null) updateData.role = payload.role;
    if (payload.is_admin_panel_allowed !== undefined) updateData.is_admin_panel_allowed = payload.is_admin_panel_allowed;

    console.log('[users] Direct DB update data:', { userId, updateData });

    // Direct database update (bypasses unreliable Edge Function)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId)
        .select();

      if (error) {
        console.error('[users] Direct update failed:', { 
          code: error.code, 
          message: error.message, 
          details: error.details,
          hint: error.hint 
        });
        throw error;
      }

      console.log('[users] Update success, updated row:', data);
      // Invalidate cache
      await cacheDelete(CACHE_KEYS.usersList());
      return { queued: false };
    } catch (dbError) {
      console.warn('[users] Direct update failed, queuing for later:', dbError);
    }
  }

  // Queue for later sync
  console.log('[users] Queuing update for later sync:', payload);
  await queueAdd('admin:updateUser', payload);
  return { queued: true };
}

/**
 * Delete user with offline queuing
 */
export async function deleteUserOffline(userId: string): Promise<{ queued: boolean }> {
  if (getNetworkStatus()) {
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;

      // Invalidate cache
      await cacheDelete(CACHE_KEYS.usersList());
      return { queued: false };
    } catch (error) {
      console.warn('[users] Delete failed, queuing for later:', error);
    }
  }

  // Queue for later sync
  await queueAdd('admin:deleteUser', { user_id: userId });
  return { queued: true };
}

/**
 * Clear users cache (call after successful sync or manual refresh)
 */
export async function clearUsersCache(): Promise<void> {
  await cacheDelete(CACHE_KEYS.usersList());
}


