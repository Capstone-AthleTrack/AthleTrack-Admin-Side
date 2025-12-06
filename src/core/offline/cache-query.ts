// src/core/offline/cache-query.ts
// Offline-first query wrapper for Supabase

import { cacheGet, cacheSet, cacheGetStale } from './db';
import { getNetworkStatus } from './network';

export type CacheStrategy = 'network-first' | 'cache-first' | 'stale-while-revalidate';

export interface CacheQueryOptions {
  /** Cache key for this query */
  key: string;
  /** How long to keep the cached data (ms). Default: 24 hours */
  ttl?: number;
  /** Cache strategy. Default: 'network-first' */
  strategy?: CacheStrategy;
  /** Force network request even if cached */
  forceRefresh?: boolean;
}

export interface CacheQueryResult<T> {
  data: T;
  fromCache: boolean;
  isStale: boolean;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Execute a query with offline caching support
 * 
 * @param fetcher - Async function that fetches the data from the network
 * @param options - Cache configuration
 * @returns Query result with cache metadata
 * 
 * @example
 * const result = await cachedQuery(
 *   () => supabase.from('sports').select('*'),
 *   { key: 'sports:list', ttl: 60000 }
 * );
 */
export async function cachedQuery<T>(
  fetcher: () => Promise<T>,
  options: CacheQueryOptions
): Promise<CacheQueryResult<T>> {
  const { key, ttl = DEFAULT_TTL, strategy = 'network-first', forceRefresh = false } = options;
  const isOnline = getNetworkStatus();

  // Network-first strategy (default): Try network, fall back to cache
  if (strategy === 'network-first') {
    if (isOnline && !forceRefresh) {
      try {
        const data = await fetcher();
        // Cache the result
        await cacheSet(key, data, ttl);
        return { data, fromCache: false, isStale: false };
      } catch (error) {
        // Network failed, try cache
        const cached = await cacheGetStale<T>(key);
        if (cached) {
          console.log(`[cache] Network failed, using cached data for: ${key}`);
          return { data: cached.data, fromCache: true, isStale: cached.isStale };
        }
        throw error; // No cache available
      }
    } else {
      // Offline: Return cached data (even stale)
      const cached = await cacheGetStale<T>(key);
      if (cached) {
        return { data: cached.data, fromCache: true, isStale: cached.isStale };
      }
      throw new Error(`No cached data available for: ${key} (offline)`);
    }
  }

  // Cache-first strategy: Use cache if available, only fetch if missing/expired
  if (strategy === 'cache-first') {
    if (!forceRefresh) {
      const cached = await cacheGet<T>(key);
      if (cached) {
        return { data: cached, fromCache: true, isStale: false };
      }
    }

    // Cache miss or expired - fetch from network
    if (isOnline) {
      const data = await fetcher();
      await cacheSet(key, data, ttl);
      return { data, fromCache: false, isStale: false };
    } else {
      // Offline and no fresh cache - try stale
      const stale = await cacheGetStale<T>(key);
      if (stale) {
        return { data: stale.data, fromCache: true, isStale: true };
      }
      throw new Error(`No cached data available for: ${key} (offline)`);
    }
  }

  // Stale-while-revalidate: Return cache immediately, refresh in background
  if (strategy === 'stale-while-revalidate') {
    const cached = await cacheGetStale<T>(key);
    
    if (cached && !forceRefresh) {
      // Return cached data immediately
      // Revalidate in background if online
      if (isOnline) {
        fetcher()
          .then((data) => cacheSet(key, data, ttl))
          .catch((error) => console.warn(`[cache] Background refresh failed for: ${key}`, error));
      }
      return { data: cached.data, fromCache: true, isStale: cached.isStale };
    }

    // No cache - must fetch
    if (isOnline) {
      const data = await fetcher();
      await cacheSet(key, data, ttl);
      return { data, fromCache: false, isStale: false };
    }

    throw new Error(`No cached data available for: ${key} (offline)`);
  }

  throw new Error(`Unknown cache strategy: ${strategy}`);
}

/**
 * Prefetch data into cache (for anticipatory caching)
 */
export async function prefetch<T>(
  fetcher: () => Promise<T>,
  key: string,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  if (!getNetworkStatus()) return;

  try {
    const data = await fetcher();
    await cacheSet(key, data, ttl);
    console.log(`[cache] Prefetched: ${key}`);
  } catch (error) {
    console.warn(`[cache] Prefetch failed for: ${key}`, error);
  }
}

/**
 * Generate cache keys for common query patterns
 */
export const CacheKeys = {
  sports: {
    list: () => 'sports:list',
    detail: (slug: string) => `sports:${slug}`,
    bundle: (slug: string) => `sports:bundle:${slug}`,
  },
  athlete: {
    detail: (id: string) => `athlete:${id}`,
    bundle: (id: string) => `athlete:bundle:${id}`,
  },
  profile: {
    me: () => 'profile:me',
  },
  metrics: {
    daily: () => 'metrics:daily',
    loginFrequency: (from: string, to: string) => `metrics:login:${from}:${to}`,
  },
  users: {
    admins: () => 'users:admins',
    requests: () => 'users:requests',
  },
} as const;




