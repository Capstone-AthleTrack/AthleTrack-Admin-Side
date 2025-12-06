// src/hooks/useOfflineQuery.ts
// React hook for offline-first data fetching

import { useState, useEffect, useCallback, useRef } from 'react';
import { cachedQuery, type CacheStrategy } from '@/core/offline';
import { useIsOnline } from './useNetworkStatus';

export interface UseOfflineQueryOptions {
  /** Cache key for this query */
  key: string;
  /** How long to keep cached data (ms). Default: 24 hours */
  ttl?: number;
  /** Cache strategy. Default: 'network-first' */
  strategy?: CacheStrategy;
  /** Whether to fetch immediately. Default: true */
  enabled?: boolean;
  /** Refetch when coming back online. Default: true */
  refetchOnReconnect?: boolean;
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
    strategy = 'network-first',
    enabled = true,
    refetchOnReconnect = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [isStale, setIsStale] = useState(false);
  
  const isOnline = useIsOnline();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetch = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    setIsLoading(true);
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, key, ttl, strategy]);

  // Initial fetch
  useEffect(() => {
    fetch();
  }, [fetch]);

  // Refetch when coming back online
  useEffect(() => {
    if (isOnline && refetchOnReconnect && fromCache) {
      fetch();
    }
  }, [isOnline, refetchOnReconnect, fromCache, fetch]);

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

