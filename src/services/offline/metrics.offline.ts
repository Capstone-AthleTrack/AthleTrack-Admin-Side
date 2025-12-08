// src/services/offline/metrics.offline.ts
// Offline-enabled wrapper for metrics service

import { cachedQuery, CacheKeys, queueAdd, getNetworkStatus } from '@/core/offline';
import {
  fetchDailyReports,
  fetchLoginFrequency,
  logSession as originalLogSession,
  logLogin as originalLogLogin,
} from '@/services/metrics';

const DAILY_REPORTS_TTL = 5 * 60 * 1000; // 5 minutes
const LOGIN_FREQUENCY_TTL = 15 * 60 * 1000; // 15 minutes

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Fetch daily reports with offline caching
 */
export async function fetchDailyReportsOffline(): Promise<{
  data: { appVisits: number; activeUsers: number; day: string };
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    () => fetchDailyReports(),
    {
      key: CacheKeys.metrics.daily(),
      ttl: DAILY_REPORTS_TTL,
      strategy: 'stale-while-revalidate', // Show cached immediately, refresh in background
    }
  );
}

/**
 * Fetch login frequency with offline caching
 */
export async function fetchLoginFrequencyOffline(
  from?: Date,
  to?: Date
): Promise<{
  data: Array<{ day: string; athlete: number; coach: number }>;
  fromCache: boolean;
  isStale: boolean;
}> {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 29 * 86400000);
  
  return cachedQuery(
    () => fetchLoginFrequency(from, to),
    {
      key: CacheKeys.metrics.loginFrequency(ymd(start), ymd(end)),
      ttl: LOGIN_FREQUENCY_TTL,
      strategy: 'stale-while-revalidate', // Show cached immediately, refresh in background
    }
  );
}

/**
 * Log session with offline queuing
 * If offline, queues the log for later sync
 */
export async function logSessionOffline(platform: string = 'web'): Promise<void> {
  if (getNetworkStatus()) {
    try {
      await originalLogSession(platform);
      return;
    } catch (error) {
      console.warn('[metrics] Failed to log session, queuing for later', error);
    }
  }
  
  // Queue for later sync
  await queueAdd('logSession', { platform });
}

/**
 * Log login with offline queuing
 * If offline, queues the log for later sync
 */
export async function logLoginOffline(): Promise<void> {
  if (getNetworkStatus()) {
    try {
      await originalLogLogin();
      return;
    } catch (error) {
      console.warn('[metrics] Failed to log login, queuing for later', error);
    }
  }
  
  // Queue for later sync
  await queueAdd('logLogin', {});
}





