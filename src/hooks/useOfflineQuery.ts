// src/hooks/useOfflineQuery.ts
// React hook for offline-first data fetching with auto-refresh

import { useState, useEffect, useCallback, useRef } from 'react';
import { cachedQuery, subscribeToCacheUpdates, type CacheStrategy } from '@/core/offline';
import { useIsOnline } from './useNetworkStatus';

export interface UseOfflineQueryOptions {
  /** Cache key for this query */
  key: string;
  /** How long to keep cached data (ms). Default: 24 hours */
  ttl?: number;
  /** Cache strategy. Default: 'stale-while-revalidate' for better UX */
  strategy?: CacheStrategy;
  /** Whether to fetch immediately. Default: true */
  enabled?: boolean;
  /** Refetch when coming back online. Default: true */
  refetchOnReconnect?: boolean;
  /** Auto-refresh interval (ms). Set to 0 to disable. Default: 0 */
  refetchInterval?: number;
  /** Only auto-refresh when window is focused. Default: true */
  refetchOnlyWhenFocused?: boolean;
}

export interface UseOfflineQueryResult<T> {
  /** The fetched data */
  data: T | null;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Whether the data came from cache */
  fromCache: boolean;
  /** Whether the cached data is stale */
  isStale: boolean;
  /** Manually refetch the data */
  refetch: (force?: boolean) => Promise<void>;
}

/**
 * Hook for offline-first data fetching with automatic caching
 * 
 * @param fetcher - Async function to fetch the data
 * @param options - Query configuration
 * 
 * @example
 * function SportsList() {
 *   const { data, isLoading, error, fromCache, refetch } = useOfflineQuery(
 *     () => listSports(),
 *     { key: 'sports:list', ttl: 30 * 60 * 1000 }
 *   );
 *   
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   
 *   return (
 *     <div>
 *       {fromCache && <span>Showing cached data</span>}
 *       {data?.map(sport => <Sport key={sport.id} {...sport} />)}
 *     </div>
 *   );
 * }
 */
export function useOfflineQuery<T>(
  fetcher: () => Promise<T>,
  options: UseOfflineQueryOptions
): UseOfflineQueryResult<T> {
  const {
    key,
    ttl,
    strategy = 'stale-while-revalidate', // Better default for UX
    enabled = true,
    refetchOnReconnect = true,
    refetchInterval = 0,
    refetchOnlyWhenFocused = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  
  const isOnline = useIsOnline();
  const fetcherRef = useRef(fetcher);
  const isFocusedRef = useRef(true);
  fetcherRef.current = fetcher;

  // Track window focus for smart refresh
  useEffect(() => {
    const handleFocus = () => { isFocusedRef.current = true; };
    const handleBlur = () => { isFocusedRef.current = false; };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Subscribe to cache updates for background refresh notifications
  useEffect(() => {
    if (!enabled) return;
    
    const unsubscribe = subscribeToCacheUpdates((updatedKey, updatedData) => {
      // Only update if this is our cache key
      if (updatedKey === key) {
        setData(updatedData as T);
        setFromCache(false); // Fresh data now
        setIsStale(false);
        setLastFetchTime(Date.now());
        console.log(`[useOfflineQuery] Received background update for: ${key}`);
      }
    });
    
    return unsubscribe;
  }, [enabled, key]);

  const fetch = useCallback(async (forceRefresh = false, silent = false) => {
    if (!enabled) return;

    // Don't show loading spinner for background refreshes
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const result = await cachedQuery(fetcherRef.current, {
        key,
        ttl,
        strategy,
        forceRefresh,
      });

      setData(result.data);
      setFromCache(result.fromCache);
      setIsStale(result.isStale);
      setLastFetchTime(Date.now());
    } catch (err) {
      // Only set error if we don't have cached data
      if (!data) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } else {
        console.warn(`[useOfflineQuery] Background refresh failed for ${key}:`, err);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [enabled, key, ttl, strategy, data]);

  // Initial fetch
  useEffect(() => {
    fetch();
  }, [fetch]);

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline && refetchOnReconnect && fromCache) {
      fetch(false, true); // Silent refresh
    }
  }, [isOnline, refetchOnReconnect, fromCache, fetch]);

  // Auto-refresh interval
  useEffect(() => {
    if (!refetchInterval || refetchInterval <= 0 || !enabled) return;

    const intervalId = setInterval(() => {
      // Skip if not online
      if (!isOnline) return;
      
      // Skip if window is not focused (when configured)
      if (refetchOnlyWhenFocused && !isFocusedRef.current) return;
      
      // Silent background refresh
      fetch(false, true);
    }, refetchInterval);

    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, isOnline, refetchOnlyWhenFocused, fetch]);

  // Refetch on window focus if data is stale
  useEffect(() => {
    const handleFocus = () => {
      if (!isOnline || !enabled) return;
      
      // Check if data is old enough to warrant a refresh (5 minutes)
      const staleThreshold = 5 * 60 * 1000;
      if (Date.now() - lastFetchTime > staleThreshold) {
        fetch(false, true); // Silent refresh
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isOnline, enabled, lastFetchTime, fetch]);

  const refetch = useCallback(async (force = true) => {
    await fetch(force);
  }, [fetch]);

  return {
    data,
    isLoading,
    error,
    fromCache,
    isStale,
    refetch,
  };
}

