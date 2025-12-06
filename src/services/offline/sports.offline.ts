// src/services/offline/sports.offline.ts
// Offline-enabled wrapper for sports service

import { cachedQuery, CacheKeys, getNetworkStatus } from '@/core/offline';
import {
  listSports,
  loadSportBundle,
  loadAthleteBundle,
  type VSport,
  type VCoach,
  type VAthleteLite,
  type VPrePostOverview,
  type VPerfOverview,
  type ProfileLite,
  type VAthletePrePost,
  type VAthletePerf,
} from '@/services/sports';

// Cache TTLs
const SPORTS_LIST_TTL = 30 * 60 * 1000; // 30 minutes
const SPORT_BUNDLE_TTL = 15 * 60 * 1000; // 15 minutes
const ATHLETE_BUNDLE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * List all sports with offline caching
 */
export async function listSportsOffline(): Promise<{
  data: VSport[];
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    () => listSports(),
    {
      key: CacheKeys.sports.list(),
      ttl: SPORTS_LIST_TTL,
      strategy: 'network-first',
    }
  );
}

/**
 * Load sport bundle (coaches, athletes, performance data) with offline caching
 */
export async function loadSportBundleOffline(slug: string): Promise<{
  data: {
    coaches: VCoach[];
    athletes: VAthleteLite[];
    prepost: VPrePostOverview[];
    performance: VPerfOverview[];
  };
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    () => loadSportBundle(slug),
    {
      key: CacheKeys.sports.bundle(slug),
      ttl: SPORT_BUNDLE_TTL,
      strategy: 'network-first',
    }
  );
}

/**
 * Load athlete bundle (profile, pre/post, performance) with offline caching
 */
export async function loadAthleteBundleOffline(athleteId: string): Promise<{
  data: {
    profile: ProfileLite;
    prepost: VAthletePrePost[];
    performance: VAthletePerf[];
  };
  fromCache: boolean;
  isStale: boolean;
}> {
  return cachedQuery(
    () => loadAthleteBundle(athleteId),
    {
      key: CacheKeys.athlete.bundle(athleteId),
      ttl: ATHLETE_BUNDLE_TTL,
      strategy: 'network-first',
    }
  );
}

/**
 * Prefetch sport data for offline access
 * Call this when user is browsing the sports list to pre-cache detail pages
 */
export async function prefetchSportBundle(slug: string): Promise<void> {
  if (!getNetworkStatus()) return;
  
  try {
    const data = await loadSportBundle(slug);
    const { cacheSet } = await import('@/core/offline');
    await cacheSet(CacheKeys.sports.bundle(slug), data, SPORT_BUNDLE_TTL);
    console.log(`[prefetch] Sport bundle cached: ${slug}`);
  } catch (error) {
    console.warn(`[prefetch] Failed to cache sport bundle: ${slug}`, error);
  }
}

/**
 * Prefetch athlete data for offline access
 */
export async function prefetchAthleteBundle(athleteId: string): Promise<void> {
  if (!getNetworkStatus()) return;
  
  try {
    const data = await loadAthleteBundle(athleteId);
    const { cacheSet } = await import('@/core/offline');
    await cacheSet(CacheKeys.athlete.bundle(athleteId), data, ATHLETE_BUNDLE_TTL);
    console.log(`[prefetch] Athlete bundle cached: ${athleteId}`);
  } catch (error) {
    console.warn(`[prefetch] Failed to cache athlete bundle: ${athleteId}`, error);
  }
}

