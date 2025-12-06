// src/services/offline/dashboard.offline.ts
// Offline-enabled wrapper for dashboard data

import { cachedQuery } from '@/core/offline';
import { supabase } from '@/core/supabase';

// Cache TTLs
const KPI_TTL = 5 * 60 * 1000; // 5 minutes
const USAGE_SERIES_TTL = 10 * 60 * 1000; // 10 minutes
const LOGIN_SERIES_TTL = 15 * 60 * 1000; // 15 minutes

// ---- Types ----
export type UsagePoint = { time: string; active: number; visits: number };
export type LoginPoint = { date: string; coaches: number; athletes: number };
export type KPIData = {
  total_users: number;
  app_visits: number;
  new_users: number;
  active_users: number;
};

// ---- Helpers ----
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function dayBoundsPH(d: Date): { fromIso: string; toIso: string; day: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const dd = d.getDate();
  const fromUtc = new Date(Date.UTC(y, m, dd, -8, 0, 0, 0));
  const toUtc = new Date(Date.UTC(y, m, dd + 1, -8, 0, 0, 0));
  return { fromIso: fromUtc.toISOString(), toIso: toUtc.toISOString(), day: ymd(d) };
}

function toPH(utcIso: string): Date {
  const t = new Date(utcIso).getTime();
  return new Date(t + PH_OFFSET_MS);
}

function fmtHourLabelFromDate(d: Date) {
  return d.toLocaleString('en-US', { hour: 'numeric', hour12: true });
}

function fmtDayLabel(ts: string) {
  const d = new Date(ts);
  const label = d.toLocaleString('en-US', { month: 'long', day: '2-digit' });
  return label.toUpperCase();
}

// ---- Cache Keys ----
const CACHE_KEYS = {
  kpi: () => 'dashboard:kpi',
  usageSeries: () => 'dashboard:usage',
  loginSeries: () => 'dashboard:login',
};

/**
 * Fetch KPI data with offline caching
 */
export async function fetchKPIOffline(): Promise<{
  data: KPIData;
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    async () => {
      const today = new Date();
      const { fromIso: phStartIso, toIso: phEndIso } = dayBoundsPH(today);

      // Total users
      let totalUsers = 0;
      {
        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        if (!error && typeof count === 'number') totalUsers = count;
      }

      // New users today
      let newUsers = 0;
      {
        const r1 = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', phStartIso)
          .lt('created_at', phEndIso);
        if (!r1.error && typeof r1.count === 'number') {
          newUsers = r1.count;
        }
      }

      return {
        total_users: totalUsers,
        app_visits: 0, // Will be updated by usage series
        new_users: newUsers,
        active_users: 0, // Will be updated by usage series
      };
    },
    {
      key: CACHE_KEYS.kpi(),
      ttl: KPI_TTL,
      strategy: 'stale-while-revalidate',
    }
  );
}

/**
 * Fetch usage series (24h) with offline caching
 */
export async function fetchUsageSeriesOffline(): Promise<{
  data: UsagePoint[];
  appVisits: number;
  activeUsers: number;
  fromCache: boolean;
  isStale: boolean;
}> {
  const result = await cachedQuery(
    async () => {
      const { data, error } = await supabase
        .from('v_daily_activity_24h')
        .select('bucket, active_users, session_starts')
        .order('bucket', { ascending: true });

      if (!error && Array.isArray(data)) {
        const mapped: UsagePoint[] = data.map((r: {
          bucket: string;
          active_users: number | null;
          session_starts: number | null;
        }) => {
          const ph = toPH(r.bucket);
          return {
            time: fmtHourLabelFromDate(
              new Date(ph.getFullYear(), ph.getMonth(), ph.getDate(), ph.getHours())
            ),
            active: Number(r.active_users ?? 0),
            visits: Number(r.session_starts ?? 0),
          };
        });
        return mapped;
      }

      // Fallback: empty 24h baseline
      const now = new Date();
      const buckets: UsagePoint[] = [];
      for (let i = 23; i >= 0; i--) {
        const h = new Date(now.getTime() - i * 60 * 60 * 1000);
        buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
      }
      return buckets;
    },
    {
      key: CACHE_KEYS.usageSeries(),
      ttl: USAGE_SERIES_TTL,
      strategy: 'network-first',
    }
  );

  const appVisits = result.data.reduce((s, v) => s + (v.visits || 0), 0);
  const activeUsers = result.data.reduce((m, v) => (v.active > m ? v.active : m), 0);

  return {
    data: result.data,
    appVisits,
    activeUsers,
    fromCache: result.fromCache,
    isStale: result.isStale,
  };
}

/**
 * Fetch login frequency series (30 days) with offline caching
 */
export async function fetchLoginSeriesOffline(): Promise<{
  data: LoginPoint[];
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 29 * 86400000);

      const { data, error } = await supabase
        .from('vw_daily_login_frequency')
        .select('day, role, logins')
        .gte('day', ymd(start))
        .lte('day', ymd(end))
        .order('day', { ascending: true })
        .order('role', { ascending: true });

      if (!error && Array.isArray(data)) {
        const rows = data as Array<{ day: string; role: string; logins: number | null }>;
        const byDay: Record<string, { athletes: number; coaches: number }> = {};
        
        for (const r of rows) {
          const dayKey = r.day;
          if (!byDay[dayKey]) byDay[dayKey] = { athletes: 0, coaches: 0 };
          const cnt = Number(r.logins ?? 0);
          if (r.role === 'athlete') byDay[dayKey].athletes = cnt;
          else if (r.role === 'coach') byDay[dayKey].coaches = cnt;
        }

        // Build continuous series
        const series: LoginPoint[] = [];
        const cur = new Date(start);
        const endDate = new Date(end);
        while (cur <= endDate) {
          const key = ymd(cur);
          const row = byDay[key] ?? { athletes: 0, coaches: 0 };
          series.push({
            date: fmtDayLabel(cur.toISOString()),
            athletes: row.athletes,
            coaches: row.coaches,
          });
          cur.setDate(cur.getDate() + 1);
        }
        return series;
      }

      // Fallback: zeros baseline
      const zeros: LoginPoint[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
      }
      return zeros;
    },
    {
      key: CACHE_KEYS.loginSeries(),
      ttl: LOGIN_SERIES_TTL,
      strategy: 'network-first',
    }
  );
}

// ---- Default/Fallback Data ----
function getDefaultKPI(): KPIData {
  return { total_users: 0, app_visits: 0, new_users: 0, active_users: 0 };
}

function getDefaultUsageSeries(): UsagePoint[] {
  const now = new Date();
  const buckets: UsagePoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now.getTime() - i * 60 * 60 * 1000);
    buckets.push({ time: fmtHourLabelFromDate(h), active: 0, visits: 0 });
  }
  return buckets;
}

function getDefaultLoginSeries(): LoginPoint[] {
  const zeros: LoginPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    zeros.push({ date: fmtDayLabel(d.toISOString()), athletes: 0, coaches: 0 });
  }
  return zeros;
}

/**
 * Fetch all dashboard data at once with offline caching
 * Returns fallback data if fetch fails (no errors thrown)
 */
export async function fetchDashboardDataOffline(): Promise<{
  kpi: KPIData;
  usageSeries: UsagePoint[];
  loginSeries: LoginPoint[];
  fromCache: boolean;
  hasError?: boolean;
}> {
  try {
    // Fetch all data with individual error handling
    const [kpiResult, usageResult, loginResult] = await Promise.allSettled([
      fetchKPIOffline(),
      fetchUsageSeriesOffline(),
      fetchLoginSeriesOffline(),
    ]);

    // Extract data or use defaults
    const kpiData = kpiResult.status === 'fulfilled' 
      ? kpiResult.value.data 
      : getDefaultKPI();
    
    const usageData = usageResult.status === 'fulfilled'
      ? usageResult.value
      : { data: getDefaultUsageSeries(), appVisits: 0, activeUsers: 0, fromCache: false, isStale: false };
    
    const loginData = loginResult.status === 'fulfilled'
      ? loginResult.value.data
      : getDefaultLoginSeries();

    // Merge usage stats into KPI
    const kpi: KPIData = {
      ...kpiData,
      app_visits: usageData.appVisits,
      active_users: usageData.activeUsers,
    };

    const anyFromCache = 
      (kpiResult.status === 'fulfilled' && kpiResult.value.fromCache) ||
      (usageResult.status === 'fulfilled' && usageResult.value.fromCache) ||
      (loginResult.status === 'fulfilled' && loginResult.value.fromCache);

    const hasError = 
      kpiResult.status === 'rejected' ||
      usageResult.status === 'rejected' ||
      loginResult.status === 'rejected';

    if (hasError) {
      console.warn('[dashboard] Some data failed to load, using defaults');
    }

    return {
      kpi,
      usageSeries: usageData.data,
      loginSeries: loginData,
      fromCache: anyFromCache,
      hasError,
    };
  } catch (error) {
    // Catastrophic failure - return all defaults
    console.error('[dashboard] Failed to load dashboard data:', error);
    return {
      kpi: getDefaultKPI(),
      usageSeries: getDefaultUsageSeries(),
      loginSeries: getDefaultLoginSeries(),
      fromCache: false,
      hasError: true,
    };
  }
}

