// src/services/offline/prefetch.ts
// Auto-prefetch critical data for offline use after sign-in

import { cacheSet } from '@/core/offline/db';
import { getNetworkStatus } from '@/core/offline/network';
import { supabase } from '@/core/supabase';

// Cache TTLs (matching other offline services)
const TTL = {
  KPI: 5 * 60 * 1000,           // 5 minutes
  USAGE_SERIES: 10 * 60 * 1000, // 10 minutes
  LOGIN_SERIES: 15 * 60 * 1000, // 15 minutes
  SPORTS: 30 * 60 * 1000,       // 30 minutes
  USERS: 10 * 60 * 1000,        // 10 minutes
  REQUESTS: 10 * 60 * 1000,     // 10 minutes
  PROFILE: 60 * 60 * 1000,      // 1 hour
};

// Cache keys (must match those used in offline services)
// IMPORTANT: Keep in sync with users.offline.ts, requests.offline.ts, etc.
const CACHE_KEYS = {
  kpi: 'dashboard:kpi',
  usageSeries: 'dashboard:usage',
  loginSeries: 'dashboard:login',
  sportsList: 'sports:list',
  usersList: 'admin:users:list',       // Must match users.offline.ts
  requestsList: 'admin:requests:list', // Must match requests.offline.ts
  profile: 'profile:me',
};

type PrefetchProgress = {
  total: number;
  completed: number;
  current: string;
  errors: string[];
};

type ProgressCallback = (progress: PrefetchProgress) => void;

/**
 * Prefetch all critical data for offline use
 * Call this after successful sign-in
 */
export async function prefetchAllData(
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[] }> {
  if (!getNetworkStatus()) {
    console.log('[prefetch] Skipped - offline');
    return { success: false, errors: ['Network offline'] };
  }

  const errors: string[] = [];
  const tasks = [
    { name: 'Dashboard KPIs', fn: prefetchKPI },
    { name: 'Usage Series', fn: prefetchUsageSeries },
    { name: 'Login Frequency', fn: prefetchLoginSeries },
    { name: 'Sports List', fn: prefetchSports },
    { name: 'Users List', fn: prefetchUsers },
    { name: 'Requests List', fn: prefetchRequests },
    { name: 'Your Profile', fn: prefetchProfile },
  ];

  const progress: PrefetchProgress = {
    total: tasks.length,
    completed: 0,
    current: '',
    errors: [],
  };

  console.log('[prefetch] Starting prefetch of all critical data...');

  for (const task of tasks) {
    progress.current = task.name;
    onProgress?.(progress);

    try {
      await task.fn();
      console.log(`[prefetch] ✓ ${task.name}`);
    } catch (err) {
      const msg = `${task.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      errors.push(msg);
      progress.errors.push(msg);
      console.warn(`[prefetch] ✗ ${task.name}`, err);
    }

    progress.completed++;
    onProgress?.(progress);
  }

  const success = errors.length === 0;
  console.log(`[prefetch] Complete - ${progress.completed}/${tasks.length} successful`);

  return { success, errors };
}

/**
 * Prefetch in background without blocking
 */
export function prefetchAllDataBackground(): void {
  // Small delay to let the UI settle after sign-in
  setTimeout(() => {
    prefetchAllData().catch((err) => {
      console.warn('[prefetch] Background prefetch failed:', err);
    });
  }, 500);
}

// ---- Individual Prefetch Functions ----

async function prefetchKPI(): Promise<void> {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const dd = today.getDate();
  const fromUtc = new Date(Date.UTC(y, m, dd, -8, 0, 0, 0));
  const toUtc = new Date(Date.UTC(y, m, dd + 1, -8, 0, 0, 0));
  const phStartIso = fromUtc.toISOString();
  const phEndIso = toUtc.toISOString();

  // Total users
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  // New users today
  const { count: newUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', phStartIso)
    .lt('created_at', phEndIso);

  const kpiData = {
    total_users: totalUsers ?? 0,
    app_visits: 0,
    new_users: newUsers ?? 0,
    active_users: 0,
  };

  await cacheSet(CACHE_KEYS.kpi, kpiData, TTL.KPI);
}

async function prefetchUsageSeries(): Promise<void> {
  const { data } = await supabase
    .from('v_daily_activity_24h')
    .select('bucket, active_users, session_starts')
    .order('bucket', { ascending: true });

  if (data && Array.isArray(data)) {
    const mapped = data.map((r: { bucket: string; active_users: number | null; session_starts: number | null }) => {
      const t = new Date(r.bucket).getTime() + 8 * 60 * 60 * 1000;
      const ph = new Date(t);
      return {
        time: ph.toLocaleString('en-US', { hour: 'numeric', hour12: true }),
        active: Number(r.active_users ?? 0),
        visits: Number(r.session_starts ?? 0),
      };
    });
    await cacheSet(CACHE_KEYS.usageSeries, mapped, TTL.USAGE_SERIES);
  }
}

async function prefetchLoginSeries(): Promise<void> {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86400000);
  
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const { data } = await supabase
    .from('vw_daily_login_frequency')
    .select('day, role, logins')
    .gte('day', ymd(start))
    .lte('day', ymd(end))
    .order('day', { ascending: true })
    .order('role', { ascending: true });

  if (data && Array.isArray(data)) {
    const byDay: Record<string, { athletes: number; coaches: number }> = {};
    for (const r of data as Array<{ day: string; role: string; logins: number | null }>) {
      if (!byDay[r.day]) byDay[r.day] = { athletes: 0, coaches: 0 };
      const cnt = Number(r.logins ?? 0);
      if (r.role === 'athlete') byDay[r.day].athletes = cnt;
      else if (r.role === 'coach') byDay[r.day].coaches = cnt;
    }

    const series: Array<{ date: string; athletes: number; coaches: number }> = [];
    const cur = new Date(start);
    while (cur <= end) {
      const key = ymd(cur);
      const row = byDay[key] ?? { athletes: 0, coaches: 0 };
      const label = cur.toLocaleString('en-US', { month: 'long', day: '2-digit' }).toUpperCase();
      series.push({ date: label, athletes: row.athletes, coaches: row.coaches });
      cur.setDate(cur.getDate() + 1);
    }
    await cacheSet(CACHE_KEYS.loginSeries, series, TTL.LOGIN_SERIES);
  }
}

async function prefetchSports(): Promise<void> {
  // Use v_sports view (not 'sports' table)
  const { data } = await supabase
    .from('v_sports')
    .select('code, name, description, logo_url, is_active')
    .eq('is_active', true)
    .order('name');

  if (data) {
    await cacheSet(CACHE_KEYS.sportsList, data, TTL.SPORTS);
  }
}

async function prefetchUsers(): Promise<void> {
  // Select all fields needed by fetchUsersOffline in users.offline.ts
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, sport, team, phone, pup_id, avatar_url, created_at')
    .order('created_at', { ascending: false });

  if (!profiles) return;

  // Enrich with pup_id from multiple sources (same logic as fetchUsersOffline)
  const usersWithoutPupId = profiles.filter((u) => !u.pup_id);
  
  if (usersWithoutPupId.length > 0) {
    const pupIdByEmail: Record<string, string> = {};
    const pupIdByUserId: Record<string, string> = {};

    try {
      // 1. Get pup_ids from account_requests by email
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

      // 2. Also check account_requests by user_id
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

      // 3. Double-check profiles table for any we missed
      const stillMissing = usersWithoutPupId.filter((u) => {
        const found = 
          (u.id && pupIdByUserId[u.id]) ||
          (u.email && pupIdByEmail[u.email.toLowerCase()]);
        return !found;
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

      // Enrich profiles with found pup_ids
      for (const profile of profiles) {
        if (!profile.pup_id) {
          profile.pup_id = 
            (profile.id && pupIdByUserId[profile.id]) ||
            (profile.email && pupIdByEmail[profile.email.toLowerCase()]) ||
            null;
        }
      }
    } catch (err) {
      console.warn('[prefetch] Failed to enrich pup_ids:', err);
    }
  }

  await cacheSet(CACHE_KEYS.usersList, profiles, TTL.USERS);
}

async function prefetchRequests(): Promise<void> {
  // Pending requests
  const { data: pending } = await supabase
    .from('account_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Recent decided requests (last 50)
  const { data: decided } = await supabase
    .from('account_requests')
    .select('*')
    .neq('status', 'pending')
    .order('decided_at', { ascending: false })
    .limit(50);

  const allRequests = [...(pending ?? []), ...(decided ?? [])];
  await cacheSet(CACHE_KEYS.requestsList, allRequests, TTL.REQUESTS);
}

async function prefetchProfile(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (data) {
    await cacheSet(CACHE_KEYS.profile, data, TTL.PROFILE);
    
    // Also prefetch the user's own avatar
    if (data.avatar_url) {
      try {
        await prefetchAvatar(data.avatar_url);
      } catch {
        // Ignore avatar prefetch errors
      }
    }
  }
}

/**
 * Prefetch an avatar image into the browser cache
 */
async function prefetchAvatar(avatarUrl: string): Promise<void> {
  if (!avatarUrl) return;
  
  // Use fetch to trigger browser caching (service worker will cache it)
  const response = await fetch(avatarUrl, { mode: 'no-cors' });
  if (!response.ok && response.type !== 'opaque') {
    console.warn('[prefetch] Failed to prefetch avatar:', avatarUrl);
  }
}

/**
 * Prefetch avatars for a list of user IDs
 */
export async function prefetchUserAvatars(userIds: string[]): Promise<void> {
  if (!getNetworkStatus() || userIds.length === 0) return;

  try {
    // Get avatar URLs for the users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', userIds.slice(0, 20)); // Limit to 20

    if (!profiles) return;

    // Prefetch each avatar in parallel (with concurrency limit)
    const avatarUrls = profiles
      .filter((p) => p.avatar_url)
      .map((p) => p.avatar_url as string);

    // Prefetch in batches of 5
    for (let i = 0; i < avatarUrls.length; i += 5) {
      const batch = avatarUrls.slice(i, i + 5);
      await Promise.allSettled(batch.map((url) => prefetchAvatar(url)));
    }

    console.log(`[prefetch] Prefetched ${avatarUrls.length} avatars`);
  } catch (err) {
    console.warn('[prefetch] Avatar prefetch failed:', err);
  }
}

/**
 * Prefetch a specific sport's bundle (call when user views sports list)
 */
export async function prefetchSportBundles(sportCodes: string[]): Promise<void> {
  if (!getNetworkStatus()) return;

  for (const code of sportCodes.slice(0, 5)) { // Limit to first 5 sports
    try {
      // This will use the existing loadSportBundleOffline which caches automatically
      const { loadSportBundleOffline } = await import('./sports.offline');
      await loadSportBundleOffline(code);
      console.log(`[prefetch] ✓ Sport bundle: ${code}`);
    } catch (err) {
      console.warn(`[prefetch] ✗ Sport bundle: ${code}`, err);
    }
  }
}

// ---- Recently Viewed Tracking ----
const RECENT_ATHLETES_KEY = 'prefetch:recent_athletes';
const RECENT_SPORTS_KEY = 'prefetch:recent_sports';
const MAX_RECENT = 10;

/**
 * Track a recently viewed athlete (for progressive prefetching)
 */
export function trackRecentAthlete(athleteId: string): void {
  try {
    const stored = localStorage.getItem(RECENT_ATHLETES_KEY);
    const recent: string[] = stored ? JSON.parse(stored) : [];
    
    // Remove if already exists, add to front
    const filtered = recent.filter((id) => id !== athleteId);
    filtered.unshift(athleteId);
    
    // Keep only recent MAX_RECENT
    localStorage.setItem(RECENT_ATHLETES_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Track a recently viewed sport (for progressive prefetching)
 */
export function trackRecentSport(sportCode: string): void {
  try {
    const stored = localStorage.getItem(RECENT_SPORTS_KEY);
    const recent: string[] = stored ? JSON.parse(stored) : [];
    
    // Remove if already exists, add to front
    const filtered = recent.filter((code) => code !== sportCode);
    filtered.unshift(sportCode);
    
    // Keep only recent MAX_RECENT
    localStorage.setItem(RECENT_SPORTS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get recently viewed athletes
 */
function getRecentAthletes(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_ATHLETES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Get recently viewed sports
 */
function getRecentSports(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SPORTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Progressive prefetch - runs after main prefetch
 * Prefetches recently viewed sports and athletes
 */
export async function prefetchProgressiveData(): Promise<void> {
  if (!getNetworkStatus()) return;

  console.log('[prefetch] Starting progressive prefetch...');

  // 1. Prefetch recently viewed sports (up to 5)
  const recentSports = getRecentSports().slice(0, 5);
  if (recentSports.length > 0) {
    console.log(`[prefetch] Prefetching ${recentSports.length} recent sports...`);
    for (const code of recentSports) {
      if (!getNetworkStatus()) break;
      try {
        const { loadSportBundleOffline } = await import('./sports.offline');
        await loadSportBundleOffline(code);
        console.log(`[prefetch] ✓ Sport: ${code}`);
      } catch (err) {
        console.warn(`[prefetch] ✗ Sport: ${code}`, err);
      }
    }
  }

  // 2. Prefetch recently viewed athletes (up to 5)
  const recentAthletes = getRecentAthletes().slice(0, 5);
  if (recentAthletes.length > 0) {
    console.log(`[prefetch] Prefetching ${recentAthletes.length} recent athletes...`);
    for (const id of recentAthletes) {
      if (!getNetworkStatus()) break;
      try {
        const { loadAthleteBundleOffline } = await import('./sports.offline');
        await loadAthleteBundleOffline(id);
        console.log(`[prefetch] ✓ Athlete: ${id.slice(0, 8)}...`);
      } catch (err) {
        console.warn(`[prefetch] ✗ Athlete: ${id.slice(0, 8)}...`, err);
      }
    }
  }

  // 3. If no recent data, prefetch top sports from the list
  if (recentSports.length === 0) {
    try {
      const { data } = await supabase
        .from('v_sports')
        .select('code')
        .eq('is_active', true)
        .limit(3);

      if (data && data.length > 0) {
        console.log(`[prefetch] Prefetching top ${data.length} sports...`);
        for (const sport of data) {
          if (!getNetworkStatus()) break;
          try {
            const { loadSportBundleOffline } = await import('./sports.offline');
            await loadSportBundleOffline(sport.code);
            console.log(`[prefetch] ✓ Sport: ${sport.code}`);
          } catch (err) {
            console.warn(`[prefetch] ✗ Sport: ${sport.code}`, err);
          }
        }
      }
    } catch {
      // Ignore errors for progressive prefetch
    }
  }

  console.log('[prefetch] Progressive prefetch complete');
}

/**
 * Full prefetch including progressive data
 * Call this after sign-in for complete offline support
 */
export async function prefetchAllDataWithProgressive(
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[] }> {
  // First do the main prefetch
  const result = await prefetchAllData(onProgress);

  // Then do progressive prefetch in background (don't wait)
  setTimeout(() => {
    prefetchProgressiveData().catch((err) => {
      console.warn('[prefetch] Progressive prefetch failed:', err);
    });
  }, 2000); // 2 second delay after main prefetch

  return result;
}

/**
 * Prefetch in background with progressive (full offline support)
 */
export function prefetchAllDataBackgroundWithProgressive(): void {
  // Small delay to let the UI settle after sign-in
  setTimeout(() => {
    prefetchAllData()
      .then(() => {
        // After main prefetch, do progressive
        return prefetchProgressiveData();
      })
      .catch((err) => {
        console.warn('[prefetch] Background prefetch failed:', err);
      });
  }, 500);
}

